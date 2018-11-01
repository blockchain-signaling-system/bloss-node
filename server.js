'use strict'

/**
* Module dependencies.
*/
const express = require('express');
const http = require('http');
const socketio = require('socket.io');
const dotenv = require('dotenv');
const ssh2shell = require('ssh2shell');
const bodyParser = require('body-parser')
const mongoose = require('mongoose');
const chalk = require('chalk');
const axios = require('axios');

global.controllerAvailability = false;
global.statusPollingActive = true;

/**
 * Start message
 */
console.info('Starting BloSS collector')
console.info('Listening on PORT: ' + process.env.WS_PORT);

/**
 * Load environment variables from .env file
 */
dotenv.load({ path: '.env' });

/**
* Create Express Server, http server and socket.io 
*/
const app = express();
// app.use(express.json()); // Add JSON middleware
//app.use(express.json({strict: true})); // Add JSON middleware
app.use(bodyParser.json({ strict: false }));
const server = http.Server(app);
server.listen(process.env.WS_PORT);
//var io = require("./modules/sockets")(server);

var io = require("socket.io")(server);
io.on('connection', function (socket) {
    console.info("connection established")
    socket.on('isControllerAvailableRequest', function (data) {
        console.info("isControllerAvailableRequest received");
        socket.emit('isControllerAvailableRequest', {
            "controllerAvailability": global.controllerAvailability,
        });
    });

    socket.on('serviceControlRequest', function (data) {
        console.info("serviceControlRequest received"); 
        if (global.controllerAvailability) {
            switch (data.cmd) {
                case 'start':
                    console.info("Starting " + JSON.stringify(data.service));
                    execSSH("sudo systemctl start " + data.service, data.service)
                    break;
                case 'stop':
                    console.info("Stopping " + JSON.stringify(data.service));
                    execSSH("sudo systemctl stop " + data.service, data.service)
                    break;
                default:
                    console.error("Something went wrong with this request" + JSON.stringify(data));
            }

        }

    });
});



/**
 * Connect MongoDB with mongoose
 */
mongoose.connect(process.env.MONGO_DB, { useNewUrlParser: true })
    .then(() => console.info('Connected to MongoDB'))
    .catch(err => console.error('Could not connect to MongoDB', err));

// Define report schema
const reportSchema = new mongoose.Schema({
    hash: String,
    target: String,
    timestamp: { type: Date, default: Date.now },
    created: { type: Date, default: Date.now },
    action: String,
    subnetwork: String,
    addresses: [String]
});
const Report = mongoose.model('Report', reportSchema);


/** 
 * Define REST API for interaction with bloss-core
 */
app.post('/api/v1.0/report', (req, res) => {
    // This check is necessary for testing with Postman, data already arrives as JS Object and doesn't need parsing
    var attack_report;
    try {
        attack_report = JSON.parse(req.body);
    } catch (e) {
        attack_report = req.body;
        // console.info("NOT JSON");
    }

    var bgHex = getRandomColor();
    var hex = getColorByBgColor(bgHex);
    console.info("New Report with hash " + chalk.hex(hex).bgHex(bgHex).bold([attack_report.hash]) + " posted.")

    function getColorByBgColor(bgColor) {
        if (!bgColor) { return ''; }
        return (parseInt(bgColor.replace('#', ''), 16) > 0xffffff / 2) ? '#000' : '#fff';
    }

    function getRandomColor() {
        var letters = '0123456789ABCDEF';
        var color = '#';
        for (var i = 0; i < 6; i++) {
            color += letters[Math.floor(Math.random() * 16)];
        }
        return color;
    }

    // Timestamps sent from Bloss are not correctly formatted (2018-10-30-07:41:09 instead of 2018-10-30T07:41:09)
    var bodyTimeStampClean = replaceAt(attack_report.timestamp, 10, "T")
    function replaceAt(substring, index, replacement) {
        if (substring != null) {
            return substring.substr(0, index) + replacement + substring.substr(index + replacement.length);
        }
        else return null;
    }
    var timestamp = new Date(Date.parse(bodyTimeStampClean)); // UTC
    //console.log(timestamp);

    // This should only be called when the hash of the new report HAS NOT YET BEEN SAVED.
    createReport();

    async function createReport() {
        const report = new Report({
            hash: attack_report.hash,
            target: attack_report.target,
            timestamp: timestamp,
            action: attack_report.action,
            subnetwork: attack_report.subnetwork,
            addresses: attack_report.addresses
        })

        const result = await report.save();
        console.info("New Report with hash " + chalk.hex(hex).bgHex(bgHex).bold([result.hash]) + " persisted and relayed.")
        io.emit('reportChannel', { data: result });
    }

    res.json({ message: 'Report delivered' });
});





// socket.on('statusPolling', function (data) {
//     statusPollingActive = !statusPollingActive;
//     console.info("statusPollingActive changed to " + statusPollingActive);
//     if (!isControllerAvailable) {
//         console.info("Controller is not reachable.");
//     }
// });

/**
 * Polling for CONTROLLER availability
 */
setInterval(function () {
    axios.get('http://' + process.env.CONTROLLER + ':6000/api/v1.0/ping')
        .then(response => {
            if (response.status === 201) {
                console.info('global.controllerAvailability set true');
                global.controllerAvailability = true;
            } else {
                console.info('global.controllerAvailability set false');
                global.controllerAvailability = false;
            }
        })
        .catch(error => {
            global.controllerAvailability = false;
            console.error('global.controllerAvailability set false');
        });
}, 15 * 1000);

/**
 * Polling statuses of processes on CONTROLLER
 */
setInterval(function () {
    console.info("Executing getServiceStatus Interval, global.controllerAvailability:["+global.controllerAvailability+"], global.statusPollingActive;["+global.statusPollingActive+"]");            
    if (global.controllerAvailability && global.statusPollingActive) {
        getServiceStatus("bloss");
        setTimeout(function () {
            console.log('Adding some sleep.')
          }, 3000)
        getServiceStatus("geth");
        setTimeout(function () {
            console.log('Adding some sleep.')
          }, 3000)
        getServiceStatus("ipfs");
        setTimeout(function () {
            console.log('Adding some sleep.')
          }, 3000)
    } else {
        if (!global.controllerAvailability)
            console.info("Status Retrieval failed because controller is not reachable");
        else if (!global.statusPollingActive)
            console.info("Status Retrieval is deactivated");
    }
}, 15 * 1000);

/**
 * Execute SSH commands on remote controller
 */
function execSSH(cmd, service) {
    console.info("ExecSSH invoked.");
    console.info(cmd, service);
    try {

        var server = {};
        server.host = process.env.CONTROLLER;
        server.port = process.env.SSH_PORT;
        server.userName = process.env.SSH_USER;
        server.privateKey = require('fs').readFileSync(process.env.SSH_KEY);
        
        var msg = {};
        msg.send = function (message) {
            console.log(process.env.SSH_USER + '@' + process.env.CONTROLLER + ' ' + message);
        }

        var sshparams = {};
        sshparams = {
            server: server,
            commands: cmd,
            msg: msg,
            debug: true,
            verbose: true
        };
        sshparams.onEnd = function (sessionText, sshparams) {
            console.info(JSON.stringify(sessionText));
            if (service != null) {
                getServiceStatus(service);
            }
        };
        var SSH = new ssh2shell(sshparams);
        SSH.on('end', function (sessionText, sshparams) {
            this.emit('msg', sessionText);
        })
        SSH.connect();
    } catch (error) {
        console.error(error);
    }
}

function getServiceStatus(serviceName) {
    console.info("getServiceStatus invoked.");
    try {

        var server = {};
        server.host = process.env.CONTROLLER;
        server.port = process.env.SSH_PORT;
        server.userName = process.env.SSH_USER;
        server.privateKey = require('fs').readFileSync(process.env.SSH_KEY);

        var msg = {};
        msg.send = function (message) {
            console.log(process.env.SSH_USER + '@' + process.env.CONTROLLER + ' ' + message);
        }
        var command = ["sudo systemctl is-active " + serviceName];
        var hosts = { };     
        hosts = {
            server: server,
            commands: command,
            msg: msg,
            debug: true,
            verbose: true
        };        
        hosts.onEnd = function (sessionText) {
            if (sessionText.includes("inactive")) {
                console.info(serviceName + " is inactive");
                io.emit('statusChannel', { [serviceName]: "inactive" });
            } else if (sessionText.includes("active")) {
                console.info(serviceName + " is active");
                io.emit('statusChannel', { [serviceName]: "active" });
            }
        };
        var SSH = new ssh2shell(hosts);
        SSH.on('end', function (sessionText) {
            this.emit('msg', sessionText);
            console.info('we here');
        })
        SSH.connect();


    } catch (error) {
        console.error(error);
    }
}