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

var fs = require('fs');
var util = require('util');
var log_file = fs.createWriteStream(__dirname + '/debug.log', { flags: 'w' });
var log_stdout = process.stdout;
console.log = function (d) { //
    log_file.write(util.format(d) + '\n');
    log_stdout.write(util.format(d) + '\n');
};


global.controllerAvailability = false;

/**
 * Start message
 */
console.info('Starting BloSS collector')

/**
 * Load environment variables from .env file
 */
dotenv.load({ path: '.env' });
console.info('Listening on PORT: ' + process.env.WS_PORT);

/**
* Create Express Server, http server and socket.io 
*/
const app = express();

/**
 * TODO: Fix this JSON mess.
 */
// app.use(express.json()); // Add JSON middleware
// app.use(express.json({strict: true})); // Add JSON middleware
app.use(bodyParser.json({ strict: false }));
// app.use(bodyParser.json());
const server = http.Server(app);
server.listen(process.env.WS_PORT);
//var io = require("./modules/sockets")(server);

/**
 * Declare websocket endpoints
 */
var io = require("socket.io")(server);
io.on('connection', function (socket) {
    console.info("Connection established")
    /**
     * Receives controls regarding MREQs
     */
    socket.on('responseMREQ', function (data) {
        console.info("responseMREQ for " + data._id + " is " + data.action);
        if (global.controllerAvailability) {
            updateAttackReport(data._id, data.action);
        }
    });

    /**
     * Controls services on the controller
     */
    socket.on('serviceControlRequest', function (data) {
        console.info("serviceControlRequest received");
        if (global.controllerAvailability) {
            switch (data.cmd) {
                case 'start':
                    console.info("Starting " + JSON.stringify(data.service));
                    execSSH("sudo systemctl start " + data.service, data.service);
                    break;
                case 'stop':
                    console.info("Stopping " + JSON.stringify(data.service));
                    execSSH("sudo systemctl stop " + data.service, data.service);
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

/**
 * mongoos schema of attack reports
 */
const reportSchema = new mongoose.Schema({
    hash: String,
    target: String,
    timestamp: { type: Date, default: Date.now },
    created: { type: Date, default: Date.now },
    action: String,
    subnetwork: String,
    addresses: [String],
    status: { type: String, default: "T_REQUESTS" },
});
const Report = mongoose.model('Report', reportSchema);


function updateAttackReport(id, action) {
    console.log("Trying to find report with hash+" + id);

    async function findReport(id) {
        // Query
        const updateReport = await Report.findById(id);
        // Modify
        updateReport.status = action;
        // Save
        const result = await updateReport.save();
        // Log
        console.info("Changed " + result.id + " to " + result.status)
        // Emitting update back to client
        io.emit('reportChannel', { data: result });
        // Logging object 
        console.log(result);

        switch (result.status) {
            case 'M_DECLINED':
                // Send command to rest-endpoint on bloss-core
                console.info("declined for " + id + " is " + action);
                // We don't need to do anything since it's been declined. 
                break;
            case 'M_APPROVED':
                // Send command to rest-endpoint on bloss-core
                console.info("accept for " + id + " is " + action);
                console.log(result.addresses);
                console.log(JSON.stringify(result.addresses));
                console.log(result.addresses.length);

                // var myTruncatedString = myString.substring(0,length);
                console.log("Before" + result.timestamp);
                var ts = JSON.stringify(result.timestamp);
                console.log("ts:" + ts);
                var ts_date = ts.substring(1, 11) + "-";
                console.log("ts_date:" + ts_date);

                var ts_time = ts.substring(12, 20);
                console.log("ts_time:" + ts_time);

                var ts_for_post = ts_date + ts_time;

                var request = require("request");
                var options = {
                    method: 'POST',
                    url: 'http://172.10.15.17:6001/api/v1.0/mitigate',
                    headers:
                    {
                        'cache-control': 'no-cache',
                        'content-type': 'application/json'
                    },
                    body:
                    {
                        hash: parseInt(result.hash),
                        target: result.target,
                        timestamp: ts_for_post,
                        action: result.action,
                        subnetwork: result.subnetwork,
                        addresses: result.addresses
                    },
                    json: true
                };

                request(options, function (error, response, body) {
                    if (error) throw new Error(error);
                    console.log(body);
                    console.log(response)
                });

                // var addressArray = [];
                // addressArray = JSON.parse(JSON.stringify(result.addresses));
                // console.log(addressArray);

                // axios.post(process.env.ENDPOINT_BLOSS + '/api/v1.0/mitigatereport', {
                //     "hash": parseInt(result.hash),
                //     "target": result.target,
                //     "timestamp": ts_for_post,
                //     "action": result.action,
                //     "subnetwork": result.subnetwork,
                //     "addresses": result.addresses
                // })
                //     .then(function (response) {
                //         console.log(response.status);
                //     })
                //     .catch(function (error) {
                //         console.log(error);
                //         console.log("There has been an error");
                //     });
                break;
            default:
                console.error("Something went wrong with this request");
        }
    }
    findReport(id);
}

/** 
 * Define REST API for interaction with bloss-core
 */
app.post('/api/v1.0/report', (req, res) => {
    console.log('/api/v1.0/report called');

    console.log("Target" + req.body.target);

    // This check is necessary for testing with Postman, data already arrives as JS Object and doesn't need parsing
    var attack_report;
    try {
        attack_report = JSON.parse(req.body);
    } catch (e) {
        attack_report = req.body;
        // console.info("NOT JSON");
    }

    console.log(attack_report);

    try {
        //Step 1: declare promise
        var checkDuplicatePromise = () => {
            // console.log(attack_report);
            return new Promise((resolve, reject) => {
                Report.find({ hash: attack_report.hash }, function (err, data) {
                    err
                        ? reject(err)
                        : resolve(data);
                });
            });
        };

        var persistAttackReportPromise = () => {
            return new Promise((resolve, reject) => {
                // Timestamps sent from Bloss are not correctly formatted (2018-10-30-07:41:09 instead of 2018-10-30T07:41:09)
                var bodyTimeStampClean = replaceAt(attack_report.timestamp, 10, "T")
                function replaceAt(substring, index, replacement) {
                    if (substring != null) {
                        return substring.substr(0, index) + replacement + substring.substr(index + replacement.length);
                    }
                    else return null;
                }
                var timestamp = new Date(Date.parse(bodyTimeStampClean)); // UTC

                const report = new Report({
                    hash: attack_report.hash,
                    target: attack_report.target,
                    timestamp: timestamp,
                    action: attack_report.action,
                    subnetwork: attack_report.subnetwork,
                    addresses: attack_report.addresses,
                    status: attack_report.status
                });

                report.save(function (err, data) {
                    if (err) {
                        console.error("There has been a problem while saving", err);
                    } else {
                        console.info("New Report with hash " + data.hash + " persisted and relayed.")
                        io.emit('reportChannel', { data: data });
                        res.json({ message: 'Report persisted', data: data });
                    }
                });
            });
        };

        //Step 2: async promise handler
        var callCheckDuplicatePromise = async () => {
            console.log("Calling checkDuplicatePromise");
            var result = await (checkDuplicatePromise());
            if (result.length > 0) {
                console.info("There is already an attack report with hash:" + result[0].hash);
            } else {
                console.log("Calling persistAttackReportPromise");
                var persist = await (persistAttackReportPromise());
                //anything here is executed after result is resolved
            }
        };

        //Step 3: make the call
        callCheckDuplicatePromise().then(function (result) {
            res.json({ message: 'Report already persisted' });
        });
    } catch (e) {
        next(e)
    }
});

app.post('/api/v1.0/get-report', (req, res) => {
    console.log('/api/v1.0/get-report called');

    // This check is necessary for testing with Postman, data already arrives as JS Object and doesn't need parsing
    var attack_report;
    try {
        attack_report = JSON.parse(req.body);
    } catch (e) {
        attack_report = req.body;
        // console.info("NOT JSON");
    }

    try {
        //Step 1: declare promise
        var checkRequestHash = () => {
            // console.log(attack_report);
            return new Promise((resolve, reject) => {
                Report.find({ hash: attack_report.hash }, function (err, data) {
                    err
                        ? reject(err)
                        : resolve(data);
                });
            });
        };

        //Step 2: async promise handler
        var callCheckRequestHashPromise = async () => {
            console.log("Calling callCheckRequestHashPromise");
            var result = await (checkRequestHash());
            // console.log(result);
            try {
                if (result.length === 1); {
                    if (result[0].hash === attack_report.hash) {
                        console.info("We found the attack_report:");
                        res.json({ report: result[0] });
                        res.end()
                    }
                }
            } catch (e) {
                res.status(404).json({ message: 'Couldnt find report' });
                res.end()
                console.info("Report not found.");
            }

        };

        //Step 3: make the call
        callCheckRequestHashPromise().then(function (result) {
        }).catch(function (err) {
            console.info("Something went wrong.", err);
        });
    } catch (e) {
        next(e)
    }
});

/**
 * Polling statuses of processes on CONTROLLER
 */
setInterval(function () {
    global.controllerAvailability = true;
    io.emit('isControllerAvailable', {
        "controllerAvailability": global.controllerAvailability,
    });
    console.log("emitting isControllerAvailable");
}, 15 * 1000);

/**
 * Polling statuses of processes on CONTROLLER
 */
setInterval(function () {
    console.info("Executing getServiceStatus Interval, global.controllerAvailability:[" + global.controllerAvailability + "]");
    if (global.controllerAvailability) {
        setTimeout(function () {
            getServiceStatus("bloss");
            // console.log('Adding some sleep.')
        }, 1000);
        setTimeout(function () {
            getServiceStatus("geth");
            // console.log('Adding some sleep.')
        }, 1000);
        setTimeout(function () {
            getServiceStatus("ipfs");
            // console.log('Adding some sleep.')
        }, 1000);
    } else {
        if (!global.controllerAvailability) {
            console.info("Status Retrieval failed because controller is not reachable");
        }
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
            // console.log(process.env.SSH_USER + '@' + process.env.CONTROLLER + ' ' + message);
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
            // console.info(JSON.stringify(sessionText));
            // console.info('Got some sessionText');
            // if (service != null) {
            //     getServiceStatus(service);
            // }
        };
        var SSH = new ssh2shell(sshparams);
        SSH.on('end', function (sessionText, sshparams) {
            this.emit('msg', sessionText);
        })
        SSH.connect();
    } catch (error) {
        // console.error(error);
        console.error('There has been an error while querying via ssh');
    }
}

function getServiceStatus(serviceName) {
    // console.info("getServiceStatus invoked.");
    try {

        var server = {};
        server.host = process.env.CONTROLLER;
        server.port = process.env.SSH_PORT;
        server.userName = process.env.SSH_USER;
        server.privateKey = require('fs').readFileSync(process.env.SSH_KEY);

        var msg = {};
        msg.send = function (message) {
            // console.log(process.env.SSH_USER + '@' + process.env.CONTROLLER + ' ' + message);
        }
        var command = ["sudo systemctl is-active " + serviceName];
        var hosts = {};
        hosts = {
            server: server,
            commands: command,
            msg: msg,
            debug: true,
            verbose: true
        };
        hosts.onEnd = function (sessionText) {
            if (sessionText.includes("inactive")) {
                // console.info(serviceName + " is inactive");
                io.emit('statusChannel', { [serviceName]: "inactive" });
            } else if (sessionText.includes("active")) {
                // console.info(serviceName + " is active");
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