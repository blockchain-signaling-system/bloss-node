'use strict'

/**
* Module dependencies.
*/
const express = require('express');
//const logger = require('./modules/console');
const http = require('http');
const socketio = require('socket.io');
const dotenv = require('dotenv');
const ssh2shell = require('ssh2shell');
const bodyParser = require('body-parser')
const mongoose = require('mongoose');
const chalk = require('chalk');


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
var io = require("./modules/sockets")(server);


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
        // console.log("We here" + result);
        console.info("New Report with hash " + chalk.hex(hex).bgHex(bgHex).bold([result.hash]) + " persisted and relayed.")
        // console.info("New Report with hash "+ chalk.bgGreen.black.bold([result.hash]) +" saved and relayed.")
        io.emit('reportChannel', { data: result });
    }

    res.json({ message: 'Report delivered' });
});