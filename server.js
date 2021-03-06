'use strict'

/**
* Module dependencies.
*/
const express = require('express');
const http = require('http');
const dotenv = require('dotenv');
const ssh2shell = require('ssh2shell');
const bodyParser = require('body-parser')
const mongoose = require('mongoose');
const chalk = require('chalk');
var request = require("request");
const moment = require('moment');

/**
 * Constants
 */
const MitigationRequest = require('./mitigationReq');
const RequestMitigation = require('./reqMitigation');


/** 
 * Declaring logging relevant variables
 */
var fs = require('fs');
var util = require('util');
var log_file = fs.createWriteStream(process.env.CONTROLLER + '/log.log', { flags: 'w' });
var error_file = fs.createWriteStream(process.env.CONTROLLER + '/error.log', { flags: 'w' });
var error_prefix = chalk.hex("#282828").bgHex("#c6455b").bold(" ERROR ") + " ";
var log_prefix = chalk.hex("#282828").bgHex("#a0a0a0").bold(" LOG ") + " ";
var info_prefix = chalk.hex("#282828").bgHex("#3ac9d1").bold(" INFO ") + " ";
var WS_prefix = chalk.hex("#282828").bgHex("#3ac9d1").bold(" WS ") + " ";
var CONFIG_prefix = chalk.hex("#282828").bgHex("#3ac9d1").bold(" CONF ") + " ";
var SSH_prefix = chalk.hex("#282828").bgHex("#3ac9d1").bold(" SSH ") + " ";
var API_prefix = chalk.hex("#282828").bgHex("#43C59E").bold(" API ") + " ";
var API_report = chalk.hex("#282828").bgHex("#43C59E").bold(" REPORT ") + " ";
var API_blocking = chalk.hex("#282828").bgHex("#43C59E").bold(" BLOCKING ") + " ";
var API_alarm = chalk.hex("#282828").bgHex("#43C59E").bold(" ALARM ") + " ";
var API_post = chalk.hex("#282828").bgHex("#43C59E").bold(" POST ") + " ";
var API_success = chalk.hex("#282828").bgHex("#D2FF28").bold(" SUCCESS ") + " ";
var API_duplicate = chalk.hex("#282828").bgHex("#c6455b").bold(" DUPLICATE ") + " ";

/**
 * Add color schemata for logging output
 */
var LOG_NEW_MITIGATION_REQ = chalk.hex("#282828").bgHex("#FFFF72").bold(" NEW_MITIGATION_REQ ") + " ";
var LOG_MITIGATION_REQ_DECLINED = chalk.hex("#282828").bgHex("#C1C1C1").bold(" MITIGATION_REQ_DECLINED ") + " ";
var LOG_MITIGATION_REQ_ACCEPTED = chalk.hex("#282828").bgHex("#FFEB3B").bold(" MITIGATION_REQ_ACCEPTED ") + " ";
var LOG_MITIGATION_REQ_IN_PROGRESS = chalk.hex("#282828").bgHex("#C8B900").bold(" MITIGATION_REQ_IN_PROGRESS ") + " ";
var LOG_MITIGATION_REQ_SUCCESSFUL = chalk.hex("#282828").bgHex("#ADD681").bold(" MITIGATION_REQ_SUCCESSFUL ") + " ";

var LOG_NEW_ALARM = chalk.hex("#282828").bgHex("#D62327").bold(" NEW_ALARM ") + " ";
var LOG_ALARM_IGNORED = chalk.hex("#282828").bgHex("#C1C1C1").bold(" NEW_ALARM ") + " ";
var LOG_REQ_MITIGATION_REQUESTED = chalk.hex("#FFFFFF").bgHex("#8B0011").bold(" REQ_MITIGATION_REQUESTED ") + " ";
var LOG_REQ_MITIGATION_DECLINED = chalk.hex("#282828").bgHex("#c1c1C1").bold(" REQ_MITIGATION_DECLINED ") + " ";
var LOG_REQ_MITIGATION_IN_PROGRESS = chalk.hex("#282828").bgHex("#C8B900").bold(" REQ_MITIGATION_IN_PROGRESS ") + " ";
var LOG_REQ_MITIGATION_ACCEPTED = chalk.hex("#282828").bgHex("#FFEB3B").bold(" REQ_MITIGATION_ACCEPTED ") + " ";
var LOG_REQ_MITIGATION_SUCCESSFUL = chalk.hex("#282828").bgHex("#ADD681").bold(" REQ_MITIGATION_SUCCESSFUL ") + " ";

/**
 * Configuring logger and logfiles
 */
var log_stdout = process.stdout;
console.log = function (d) { //
    log_file.write(util.format(d) + '\n');
    log_stdout.write(log_prefix + util.format(d) + '\n');
};
console.error = function (d) { //
    error_file.write(util.format(d) + '\n');
    log_stdout.write(error_prefix + util.format(d) + '\n');
};
console.info = function (d) { //
    log_file.write(util.format(d) + '\n');
    log_stdout.write(info_prefix + util.format(d) + '\n');
};


/**
 * Global variables
 */
global.controllerAvailability = false;

/**
 * Alarm Stacks
 */
var alarmStackC400 = [];
var alarmStackC500 = [];
var alarmStackC600 = [];
var lengthWhenPoppedC400 = 0;
var lengthWhenPoppedC500 = 0;
var lengthWhenPoppedC600 = 0;

/**
 * Load environment variables from .env file
 */
dotenv.load({ path: '.env' });

/**
 * Initialize variables depending on env variable "CONTROLLER"
 * e.g. start with env CONTROLLER=CONTROLLER500 nodemon and it will adapt accordingly
 */
var WEBSOCKET_PORT;
var CONTROLLER_IP;
var SUBNET;
var MONGOD;
if (!WEBSOCKET_PORT && !CONTROLLER_IP && !SUBNET) {
    switch (process.env.CONTROLLER) {
        case 'CONTROLLER400':
            console.info(CONFIG_prefix + "Loading config for Controller400");
            WEBSOCKET_PORT = process.env.C400_WS_PORT;
            CONTROLLER_IP = process.env.C400_CONTROLLER_IP;
            SUBNET = process.env.C400_SUBNET
            MONGOD = process.env.C400_MONGOD;
            break;
        case 'CONTROLLER500':
            console.info(CONFIG_prefix + "Loading config for Controller500");
            WEBSOCKET_PORT = process.env.C500_WS_PORT;
            CONTROLLER_IP = process.env.C500_CONTROLLER_IP;
            SUBNET = process.env.C500_SUBNET;
            MONGOD = process.env.C500_MONGOD;
            break;
        case 'CONTROLLER600':
            console.info(CONFIG_prefix + "Loading config for Controller600");
            CONTROLLER_IP = process.env.C600_CONTROLLER_IP;
            WEBSOCKET_PORT = process.env.C600_WS_PORT;
            SUBNET = process.env.C600_SUBNET;
            MONGOD = process.env.C600_MONGOD;
            break;
        default:
            console.error('Initializing .env failed');
            break;
    }
}


/**
* Create Express Server, http server and socket.io 
*/
const app = express();
app.use(bodyParser.json({ strict: false }));
const server = http.Server(app);
server.listen(WEBSOCKET_PORT);
console.info(CONFIG_prefix + 'Websocket and REST listening on: ' + WEBSOCKET_PORT);

/**
 * Declare websocket endpoints
 */
var io = require("socket.io")(server);
io.on('connection', function (socket) {
    console.info(WS_prefix + "Connection established");
    /**
     * Receives controls regarding Mitigation Requests (Mitigator Perspective)
     */
    socket.on('responseMREQ', function (data) {
        // console.info("responseMREQ for " + data._id + " is " + data.action);
        if (global.controllerAvailability) {
            updateAttackReport(data._id, data.action);
        }
    });

    /**
     * Receives controls regarding Request Mitigations or Alarms
     */
    socket.on('alarmResponse', function (data) {
        // console.info("alarmResponse for " + data._id + " is " + data.action);
        if (global.controllerAvailability) {
            updateAttackReport(data._id, data.action);
        }
    })

    /**
     * Controls services on the controllers via SSH
     */
    socket.on('serviceControlRequest', function (data) {
        console.info("serviceControlRequest received");
        if (global.controllerAvailability) {
            switch (data.cmd) {
                case 'start':
                    console.info(SSH_prefix + "Starting " + JSON.stringify(data.service));
                    execSSH("sudo systemctl start " + data.service, data.service);
                    break;
                case 'stop':
                    console.info(SSH_prefix + "Stopping " + JSON.stringify(data.service));
                    execSSH("sudo systemctl stop " + data.service, data.service);
                    break;
                default:
                    console.error(SSH_prefix + "Something went wrong with this request" + JSON.stringify(data));
            }
        } else {
            console.error(SSH_prefix + "Controller not available, can't execSSH");
        }
    });
});


/**
 * Connect MongoDB with mongoose
 */
mongoose.connect(MONGOD, { useNewUrlParser: true })
    .then(() => console.info(CONFIG_prefix + 'Connected to MongoDB'))
    .catch(err => console.error(CONFIG_prefix + 'Could not connect to MongoDB', err));

/**
 * Declare mongoose schema of attack reports
 */
const reportSchema = new mongoose.Schema({
    hash: String,
    target: String,
    timestamp: { type: Date, default: Date.now },
    timestamp_requested: { type: Date, default: Date.now },
    timestamp_accepted: { type: Date, default: Date.now },
    timestamp_declined: { type: Date, default: Date.now },
    timestamp_in_progress: { type: Date, default: Date.now },
    timestamp_successful: { type: Date, default: Date.now },
    created: { type: Date, default: Date.now },
    action: String,
    subnetwork: String,
    addresses: [String],
    status: { type: String, default: MitigationRequest.NEW_MITIGATION_REQ },
});
const Report = mongoose.model('Report', reportSchema);


/**
 * 
 * This method updates attack reports status to 'action' iff a report with _id exists
 * @param {String} id a MongoDB _id that is unique for each entry 
 * @param {String} action the new attack_report status: [M_APPROVED] or [M_DECLINED]
 */
function updateAttackReport(id, action) {
    async function queryAndModify(id) {
        const updateReport = await Report.findById(id); // Query
        if (updateReport.status === MitigationRequest.MITIGATION_REQ_ACCEPTED || updateReport.status === MitigationRequest.MITIGATION_REQ_DECLINED) {
            console.error(WS_prefix + chalk.hex("#282828").bgHex("#c6455b").bold(" " + updateReport.hash + " is already " + getStatusString(updateReport.status)));
            return;
        }
        updateReport.status = action; // Modify
        var ts_update = moment(moment().format('YYYY:MM:DD-HH:mm:ss'), 'YYYYY:MM:DD-HH:mm:ss').toDate();


        /**
         * Add various timestamps depending on status
         */
        if (updateReport.status == RequestMitigation.REQ_MITIGATION_REQUESTED) {
            updateReport.timestamp_requested = ts_update;
        }

        if (action == MitigationRequest.MITIGATION_REQ_ACCEPTED) {
            updateReport.timestamp_accepted = ts_update;
        }

        if (action == MitigationRequest.MITIGATION_REQ_DECLINED) {
            updateReport.timestamp_declined = ts_update;
        }

        if (action == MitigationRequest.MITIGATION_REQ_SUCCESSFUL) {
            updateReport.timestamp_successful = ts_update;
        }


        const result = await updateReport.save(); // Save
        console.info(WS_prefix + chalk.hex("#282828").bgHex("#43C59E").bold(" " + result.hash + " changed to " + getStatusString(result.status) + " ") + " " + API_success);

        switch (result.status) {
            case MitigationRequest.MITIGATION_REQ_SUCCESSFUL:

                var target_controller_ip_and_port = getControllerIPandPort(result.target);

                var options_req_successful = {
                    method: 'POST',
                    url: 'http://' + target_controller_ip_and_port + '/api/v1.0/react',
                    headers:
                    {
                        'cache-control': 'no-cache',
                        'content-type': 'application/json'
                    },
                    body:
                    {
                        sender: CONTROLLER_IP,
                        reaction: MitigationRequest.MITIGATION_REQ_SUCCESSFUL,
                        attack_report: {
                            hash: parseInt(result.hash),
                            target: result.target,
                            timestamp: result.timestamp,
                            timestamp_declined: result.timestamp,
                            timestamp_accepted: result.timestamp_accepted,
                            timestamp_requested: result.timestamp_requested,
                            timestamp_in_progress: result.timestamp_in_progress,
                            timestamp_successful: result.timestamp_successful,
                            action: result.action,
                            subnetwork: result.subnetwork,
                            addresses: result.addresses
                        }
                    },
                    json: true
                };

                request(options_req_successful, function (error, response, body) {
                    if (error) {
                        console.error(error.message);
                    }
                    if (body) {
                        // console.log(body);
                    }
                });
                io.emit('reportChannel', { data: result }); // Emitting update back to client
                // console.info(WS_prefix + chalk.hex("#282828").bgHex("#43C59E").bold(" " + resu

                break;
            case MitigationRequest.MITIGATION_REQ_DECLINED:
                // We need to send a POST to the API of target's controller letting it know we declined the MREQ. 
                // Evaluate proper IP of controller
                var target_controller_ip_and_port = getControllerIPandPort(result.target);
                console.info(target_controller_ip_and_port);
                var options_req_declined = {
                    method: 'POST',
                    url: 'http://' + target_controller_ip_and_port + '/api/v1.0/react',
                    headers:
                    {
                        'cache-control': 'no-cache',
                        'content-type': 'application/json'
                    },
                    body:
                    {
                        sender: CONTROLLER_IP,
                        reaction: MitigationRequest.MITIGATION_REQ_DECLINED,
                        attack_report: {
                            hash: parseInt(result.hash),
                            target: result.target,
                            timestamp: result.timestamp,
                            timestamp_declined: result.timestamp_declined,
                            action: result.action,
                            subnetwork: result.subnetwork,
                            addresses: result.addresses
                        }
                    },
                    json: true
                };

                request(options_req_declined, function (error, response, body) {
                    if (error) {
                        console.error(error.message);
                    }
                    if (body) {
                        // console.log(body);
                    }
                });
                io.emit('reportChannel', { data: result }); // Emitting update back to client
                // console.info(WS_prefix + chalk.hex("#282828").bgHex("#43C59E").bold(" " + result.hash + ":" + result.status + " ") + " ");
                break;
            case MitigationRequest.MITIGATION_REQ_ACCEPTED:
                io.emit('reportChannel', { data: result }); // Emitting update back to client
                // console.info(WS_prefix + chalk.hex("#282828").bgHex("#43C59E").bold(" " + result.hash + ":" + result.status + " ") + " ");
                var ts = JSON.stringify(result.timestamp);
                var ts_date = ts.substring(1, 11) + "-";
                var ts_time = ts.substring(12, 20);
                var ts_for_post = ts_date + ts_time;

                var options = {
                    method: 'POST',
                    url: 'http://' + CONTROLLER_IP + process.env.STALK_PORT + '/api/v1.0/mitigate',
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
                    if (!error && response) {
                        if (response === undefined) {
                            console.error("Response is undefined, probably a timing issue");
                        }
                        if (response.statusCode == 202) {
                            console.info(chalk.hex("#282828").bgHex("#D2FF28").bold(" Accepted attackers for blocking "));
                        }
                        if (response.statusCode == 500) {
                            console.error("/mitigate returned [500]: Stalk controller not configured");
                            // "Failed to report attackers to blockchain"
                        }
                    }
                    if (error) {
                        if (error.code == 'ETIMEDOUT') {
                            console.error('There was a timing issue. Is the controller reachable? ')
                        } else {
                            console.error("There has been an error with code: " + error.code);
                        }
                    }
                });

                // Send reaction to other controller, also when you accept
                var target_controller_ip_and_port = getControllerIPandPort(result.target);
                console.info(target_controller_ip_and_port);
                var options_req_accepted = {
                    method: 'POST',
                    url: 'http://' + target_controller_ip_and_port + '/api/v1.0/react',
                    headers:
                    {
                        'cache-control': 'no-cache',
                        'content-type': 'application/json'
                    },
                    body:
                    {
                        sender: CONTROLLER_IP,
                        reaction: MitigationRequest.MITIGATION_REQ_ACCEPTED,
                        attack_report: {
                            hash: parseInt(result.hash),
                            target: result.target,
                            timestamp: result.timestamp,
                            timestamp_accepted: result.timestamp_accepted,
                            action: result.action,
                            subnetwork: result.subnetwork,
                            addresses: result.addresses
                        }
                    },
                    json: true
                };

                request(options_req_accepted, function (error, response, body) {
                    if (error) {
                        console.error(error.message);
                    }
                });

                break;
            case RequestMitigation.ALARM_IGNORED:
                io.emit('alarmChannel', { data: result }); // Emitting update back to client
                console.info(WS_prefix + chalk.hex("#282828").bgHex("#43C59E").bold(" " + result.hash + ":" + getStatusString(result.status) + " ") + " ");
                break;
            case RequestMitigation.REQ_MITIGATION_REQUESTED:
                console.info(WS_prefix + chalk.hex("#282828").bgHex("#43C59E").bold(" " + result.hash + ":" + getStatusString(result.status) + " ") + " ");

                var ts = JSON.stringify(result.timestamp);
                var ts_date = ts.substring(1, 11) + "-";
                var ts_time = ts.substring(12, 20);
                var ts_for_post = ts_date + ts_time;

                var options = {
                    method: 'POST',
                    max_attempts: 3,
                    retryDelay: 2000,
                    url: 'http://' + CONTROLLER_IP + process.env.BLOSS_PORT + '/api/v1.0/report',
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

                // Send request to /report
                request(options, function (error, response, body) {
                    if (!error && response) {
                        if (response === undefined) {
                            console.log("Response is undefined, probably a timing issue");
                        }
                        if (response.statusCode == 201) {
                            console.info(chalk.hex("#282828").bgHex("#D2FF28").bold(" Successfully reported attackers to blockchain "));
                            io.emit('alarmChannel', { data: result }); // Emitting update back to client
                        }
                        if (response.statusCode == 500) {
                            console.error("Failed to report attackers to blockchain");
                            /**
                             * SEND BACK ALARM AS NEW_ALARM! CHANGE BACK...
                             * Failed to report attackers to blockchain
                             * 
                             */
                            // "Failed to report attackers to blockchain"
                        }
                    }
                    if (error) {
                        if (error.code == 'ETIMEDOUT') {
                            console.error('There was a timing issue. Is the controller reachable? ')
                        } else {
                            console.error("There has been an error with code: " + error.code);
                        }
                    }
                });
                break;
            default:
                console.error("Something went wrong with this request.", id, action);
        }
    }
    queryAndModify(id);
}


/** 
 * This endpoint receives reports from bloss-core, 
 * A) saves them to MongoDB
 * B) then relays them to bloss-dashboard
 */
app.post('/api/v1.0/report', (req, res) => {
    // This check is necessary for testing with Postman, data already arrives as JS Object and doesn't need parsing
    var attack_report;
    try {
        attack_report = JSON.parse(req.body);
    } catch (e) {
        attack_report = req.body;
    }
    // console.info(API_prefix + API_report + API_post + chalk.hex("#282828").bgHex("#43C59E").bold(" " + attack_report.hash + " ") + " ");

    try {
        // Step 1: declare promise
        var checkDuplicatePromise = () => {
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
                        console.info(API_prefix + API_report + API_post + chalk.hex("#282828").bgHex("#43C59E").bold(" " + attack_report.hash + " ") + " " + API_success);
                        io.emit('reportChannel', { data: data });
                        res.json({ message: 'Report persisted', data: data });
                    }
                });
            });
        };

        // Step 2: async promise handler
        var callCheckDuplicatePromise = async () => {
            var result = await (checkDuplicatePromise());
            if (result.length > 0) {
                // There is already a report with this hash...
                // console.info(API_prefix + API_report + API_post + chalk.hex("#282828").bgHex("#43C59E").bold(" " + attack_report.hash + " ") + " " + API_duplicate + "There is already an attack report with hash:" + result[0].hash);
            } else {
                //anything here is executed after result is resolved
                var persist = await (persistAttackReportPromise());
            }
        };

        // Step 3: make the call
        callCheckDuplicatePromise().then(function (result) {
            res.json({ message: 'Report already persisted' });
        });
    } catch (e) {
        next(e)
    }
});

app.post('/api/v1.0/alarm', (req, res) => {
    // This check is necessary for testing with Postman, data already arrives as JS Object and doesn't need parsing
    var attack_report;
    try {
        attack_report = JSON.parse(req.body);
    } catch (e) {
        attack_report = req.body;
        // console.log(attack_report);
    }

    try {
        // Step 1: declare promise
        var checkDuplicatePromise = () => {
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

                var ts_from_moment = moment(moment().format('YYYY:MM:DD-HH:mm:ss'), 'YYYYY:MM:DD-HH:mm:ss').toDate();

                const report = new Report({
                    hash: attack_report.hash,
                    target: attack_report.target,
                    timestamp: ts_from_moment,
                    action: attack_report.action,
                    subnetwork: attack_report.subnetwork,
                    addresses: attack_report.addresses,
                    status: RequestMitigation.NEW_ALARM
                });
                report.save(function (err, data) {
                    if (err) {
                        console.error(err);
                        console.error("There has been a problem while saving the alarm", err);
                    } else {
                        console.info(API_prefix + API_alarm + API_post + chalk.hex("#282828").bgHex("#43C59E").bold(" [H]" + attack_report.hash + " [T]" + attack_report.target + " [A]" + attack_report.subnetwork + " ") + " " + API_success);
                        // Instead of sending via alarmChannel, add to alarmQueue
                        if (attack_report.subnetwork === process.env.C400_SUBNET) {
                            alarmStackC400.push(data);
                        }
                        if (attack_report.subnetwork === process.env.C500_SUBNET) {
                            alarmStackC500.push(data);
                        }
                        if (attack_report.subnetwork === process.env.C600_SUBNET) {
                            alarmStackC600.push(data);
                        }
                        res.json({ message: 'Report persisted', data: data });
                    }
                });
            });
        };

        // Step 2: async promise handler
        var callCheckDuplicatePromise = async () => {
            var result = await (checkDuplicatePromise());
            if (result.length > 0) {
                // There is already a report with this hash...
                console.info(API_prefix + API_alarm + API_post + chalk.hex("#282828").bgHex("#43C59E").bold(" [H]" + attack_report.hash + " ") + " " + API_duplicate + "not saved");
            } else {
                //anything here is executed after result is resolved
                var persist = await (persistAttackReportPromise());
            }
        };

        // Step 3: make the call
        callCheckDuplicatePromise().then(function (result) {
            res.json({ message: 'Alarm already persisted' });
        });
    } catch (e) {
        next(e)
    }
});

/**
 * Intervals that send out alarms and empty the alarmStack
 */
setInterval(function () {
    // When the alarmQueue is not empty
    if (alarmStackC400.length > 0 && lengthWhenPoppedC400 < alarmStackC400.length) {
        // Send newest alarm
        lengthWhenPoppedC400 = alarmStackC400.length;
        var data = alarmStackC400.pop()
        io.emit('alarmChannel', { data: data });
    }
}, 21 * 1000);
setInterval(function () {
    // When the alarmQueue is not empty
    if (alarmStackC500.length > 0 && lengthWhenPoppedC500 < alarmStackC500.length) {
        // Send newest alarm
        lengthWhenPoppedC500 = alarmStackC500.length;
        var data = alarmStackC500.pop()
        io.emit('alarmChannel', { data: data });
    }
}, 22 * 1000);
setInterval(function () {
    // When the alarmQueue is not empty
    if (alarmStackC600.length > 0 && lengthWhenPoppedC600 < alarmStackC600.length) {
        // Send newest alarm
        lengthWhenPoppedC600 = alarmStackC600.length;
        var data = alarmStackC600.pop()
        io.emit('alarmChannel', { data: data });
    }
}, 23 * 1000);

setInterval(function () {
    lengthWhenPoppedC400 = 0;
    alarmStackC400 = [];
    lengthWhenPoppedC500 = 0;
    alarmStackC500 = [];
    lengthWhenPoppedC600 = 0;
    alarmStackC600 = [];
}, 144 * 1000);

app.post('/api/v1.0/blocking', (req, res) => {

    async function callUpdateBlockingAsyncFunc() {
        var attack_report_hash;
        try {
            attack_report_hash = JSON.parse(req.body);
        } catch (e) {
            attack_report_hash = req.body.hash;
        }

        if (Math.abs(parseInt(attack_report_hash.hash)) > 0) {
            // console.info('This means bloss-core sent the hash of the report that is about to get blocked');
            try {
                const updateHashToBlockArray = await Report.find({ hash: attack_report_hash.hash });
                if (updateHashToBlockArray.length > 0) {
                    const updateHashToBlock = await Report.findById(updateHashToBlockArray[0]._id);
                    updateHashToBlock.status = MitigationRequest.MITIGATION_REQ_IN_PROGRESS; // Modify
                    var ts_update = moment(moment().format('YYYY:MM:DD-HH:mm:ss'), 'YYYYY:MM:DD-HH:mm:ss').toDate();
                    updateHashToBlock.timestamp_in_progress = ts_update;
                    const result = await updateHashToBlock.save(); // Save
                    console.info(API_prefix + API_blocking + API_post + chalk.hex("#282828").bgHex("#43C59E").bold(" " + updateHashToBlock.hash + " changed to ") + getStatusString(updateHashToBlock.status) + " " + API_success);
                    res.json({ message: 'Reaction OK', data: result });
                    io.emit('reportChannel', { data: result }); // Emitting update back to client

                    // Since this is on the local net, we also need to call react to the other instance and update to in_progress!
                    var target_controller_ip_and_port = getControllerIPandPort(result.target);
                    var options_req_in_progress = {
                        method: 'POST',
                        url: 'http://' + target_controller_ip_and_port + '/api/v1.0/react',
                        headers:
                        {
                            'cache-control': 'no-cache',
                            'content-type': 'application/json'
                        },
                        body:
                        {
                            sender: CONTROLLER_IP,
                            reaction: MitigationRequest.MITIGATION_REQ_IN_PROGRESS,
                            attack_report: {
                                hash: parseInt(result.hash),
                                target: result.target,
                                timestamp: result.timestamp,
                                timestamp_accepted: result.timestamp_accepted,
                                timestamp_in_progress: result.timestamp_in_progress,
                                action: result.action,
                                subnetwork: result.subnetwork,
                                addresses: result.addresses
                            }
                        },
                        json: true
                    };

                    // Call timer
                    countdownBlockingTime(result._id, result.hash);

                    console.log('Sending to ' + 'http://' + target_controller_ip_and_port + '/api/v1.0/react');
                    request(options_req_in_progress, function (error, response, body) {
                        if (error) {
                            console.error(error.message);
                        }
                        if (body) {
                            // console.log(body);
                        }
                    });

                }

            } catch (e) {
                console.error(e);
            }
        }
    }
    callUpdateBlockingAsyncFunc();
});



/**
 * Reaction from other controllers to RequestMitigations, can either be
 * REQ_MITIGATION_DECLINED
 * or REQ_MITIGATION_ACCEPTED
 */
app.post('/api/v1.0/react', (req, res) => {
    // console.log('/react from ' + req.body.sender);
    async function callUpdateAsyncFunc() {
        try {
            switch (req.body.reaction) {
                case MitigationRequest.MITIGATION_REQ_DECLINED:
                    // console.log('Attack report with hash' + req.body.attack_report.hash + ' is ' + MitigationRequest.REQ_MITIGATION_DECLINED);
                    // Change status in mongodb and 
                    try {
                        // console.log('Updating' + req.body.attack_report.hash + ' to ' + getStatusString(MitigationRequest.REQ_MITIGATION_DECLINED));
                        const updateReportArray = await Report.find({ hash: req.body.attack_report.hash });
                        if (updateReportArray.length > 0) {
                            const updateReport = await Report.findById(updateReportArray[0]._id);
                            // Perspective is important, this updates the REQ_MITIGATION_REQUESTED -> REQ_MITIGATION_DECLINED
                            updateReport.status = RequestMitigation.REQ_MITIGATION_DECLINED; // Modify
                            updateReport.timestamp_declined = req.body.attack_report.timestamp_declined;
                            const result = await updateReport.save(); // Save
                            console.log('Attack report with hash' + updateReport.hash + ' changed to ' + getStatusString(updateReport.status));
                            res.json({ message: 'Reaction OK', data: result });
                            io.emit('alarmChannel', { data: result }); // Emitting update back to client
                        }
                    } catch (e) {
                        console.error(e)
                    }
                    // emit back to WS client
                    break;
                case MitigationRequest.MITIGATION_REQ_ACCEPTED:
                    // console.log('Attack report with hash' + req.body.attack_report.hash + ' is ' + RequestMitigation.REQ_MITIGATION_ACCEPTED);
                    // Change status in mongodb and 
                    try {
                        const updateReportArray = await Report.find({ hash: req.body.attack_report.hash });
                        if (updateReportArray.length > 0) {
                            const updateReport = await Report.findById(updateReportArray[0]._id);
                            // Perspective is important, this updates the REQ_MITIGATION_REQUESTED -> MITIGATION_REQ_ACCEPTED
                            updateReport.status = RequestMitigation.REQ_MITIGATION_ACCEPTED; // Modify
                            updateReport.timestamp_accepted = req.body.attack_report.timestamp_accepted;
                            const result = await updateReport.save(); // Save
                            console.log('Attack report with hash' + updateReport.hash + ' changed to ' + getStatusString(updateReport.status));
                            res.json({ message: 'Reaction OK', data: result });
                            io.emit('alarmChannel', { data: result }); // Emitting update back to client
                        }
                    } catch (e) {
                        console.error(e)
                    }
                    break;
                case MitigationRequest.MITIGATION_REQ_IN_PROGRESS:
                    // console.log('Attack report with hash' + req.body.attack_report.hash + ' is ' + MitigationRequest.MITIGATION_REQ_IN_PROGRESS);
                    // Change status in mongodb and 
                    try {
                        const updateReportArray = await Report.find({ hash: req.body.attack_report.hash });
                        if (updateReportArray.length > 0) {
                            const updateReport = await Report.findById(updateReportArray[0]._id);
                            // Perspective is important, this updates the REQ_MITIGATION_REQUESTED -> MITIGATION_REQ_ACCEPTED
                            updateReport.status = RequestMitigation.REQ_MITIGATION_IN_PROGRESS; // Modify
                            updateReport.timestamp_in_progress = req.body.attack_report.timestamp_in_progress;
                            const result = await updateReport.save(); // Save
                            console.log('Attack report with hash' + updateReport.hash + ' changed to ' + getStatusString(updateReport.status));
                            res.json({ message: 'Reaction OK', data: result });
                            io.emit('alarmChannel', { data: result }); // Emitting update back to client
                        }
                    } catch (e) {
                        console.error(e)
                    }
                    break;
                case MitigationRequest.MITIGATION_REQ_SUCCESSFUL:
                    // console.log('Attack report with hash' + req.body.attack_report.hash + ' is ' + RequestMitigation.REQ_MITIGATION_SUCCESSFUL);
                    // Change status in mongodb and 
                    try {
                        // console.log('Updating' + req.body.attack_report.hash + ' to ' + MitigationRequest.REQ_MITIGATION_DECLINED);
                        const updateReportArray = await Report.find({ hash: req.body.attack_report.hash });
                        if (updateReportArray.length > 0) {
                            const updateReport = await Report.findById(updateReportArray[0]._id);
                            // Perspective is important, this updates the REQ_MITIGATION_REQUESTED -> REQ_MITIGATION_DECLINED
                            updateReport.status = RequestMitigation.REQ_MITIGATION_SUCCESSFUL; // Modify
                            updateReport.timestamp_successful = req.body.attack_report.timestamp_successful;
                            const result = await updateReport.save(); // Save
                            console.log('Attack report with hash' + updateReport.hash + ' changed to ' + getStatusString(updateReport.status));
                            res.json({ message: 'Reaction OK', data: result });
                            io.emit('alarmChannel', { data: result }); // Emitting update back to client
                        }
                    } catch (e) {
                        console.error(e)
                    }
                    break;
                default:
                    break;
            }
        } catch (e) {
            console.error('There has been a problem with /react' + e, req.body);
        }
    }
    callUpdateAsyncFunc();
});

/**
 * Polling statuses of processes on CONTROLLER
 */
setInterval(function () {
    global.controllerAvailability = true;
    io.emit('isControllerAvailable', {
        "controllerAvailability": global.controllerAvailability,
    });
}, 15 * 1000);

/**
 * Polling statuses of processes on CONTROLLER
 */
setInterval(function () {
    if (global.controllerAvailability) {
        setTimeout(function () {
            getServiceStatus("bloss");
        }, 1000);
        setTimeout(function () {
            getServiceStatus("geth");
        }, 1000);
        setTimeout(function () {
            getServiceStatus("ipfs");
        }, 1000);
    } else {
        if (!global.controllerAvailability) {
            console.info("Status Retrieval failed because controller is not reachable");
        }
    }
}, 15 * 1000);

/**
 * Executes commands on remote controller via SSH
 */
function execSSH(cmd, service) {
    console.info("ExecSSH invoked.");
    console.info("cmd:" + cmd);
    console.info("cmd:" + service);
    try {

        var server = {};
        server.host = CONTROLLER_IP;
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
            commands: [cmd],
            msg: msg,
            debug: true,
            verbose: true
        };
        sshparams.onEnd = function (sessionText, sshparams) {
        };
        var SSH = new ssh2shell(sshparams);
        SSH.on('end', function (sessionText, sshparams) {
            this.emit('msg', sessionText);
        })
        SSH.connect();
    } catch (error) {
        console.error('There has been an error while querying via ssh.');
    }
}

/**
 * 
 * Queries the service status using systemctl via SSH
 * @param {String} serviceName 
 */
function getServiceStatus(serviceName) {
    try {
        var server = {};
        server.host = CONTROLLER_IP;
        server.port = process.env.SSH_PORT;
        server.userName = process.env.SSH_USER;
        server.privateKey = require('fs').readFileSync(process.env.SSH_KEY);

        var msg = {};
        msg.send = function (message) { }
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
                io.emit('statusChannel', { [serviceName]: "inactive" });
            } else if (sessionText.includes("active")) {
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

/**
 * This function evaluates the origin of the attack_report and informs the respective node server
 * Returned is a string containing the target IP and port
 * @param {String} target 
 */
function getControllerIPandPort(target) {
    var target_subnet = target.split(".")[2];
    if (target_subnet === '40') {
        // return process.env.C400_CONTROLLER_IP+':'+process.env.C400_WS_PORT;
        return 'localhost' + ':' + process.env.C400_WS_PORT;
    }
    if (target_subnet === '50') {
        // return process.env.C500_CONTROLLER_IP+':'+process.env.C500_WS_PORT;
        return 'localhost' + ':' + process.env.C500_WS_PORT;
    }
    if (target_subnet === '60') {
        // return process.env.C600_CONTROLLER_IP+':'+process.env.C600_WS_PORT;
        return 'localhost' + ':' + process.env.C600_WS_PORT;
    }
}
/**
 * This method keeps track of all Mitigation Requests that are _IN_PROGRESS. 
 * As soon as the MAX_BLOCK_DURATION expires, the attack report is updated on this and the target controller
 */
const setTimeoutPromise = util.promisify(setTimeout);
var maxBlockDurationArr = [];
function countdownBlockingTime(id, hash) {
    maxBlockDurationArr.push(setTimeoutPromise(process.env.MAX_BLOCKING_DURATION_SECONDS * 1000, id, hash).then((id, hash) => {
        console.log('Attack report with id and hash are done blocking. id:' + id + ' hash:' + hash);
        updateAttackReport(id, MitigationRequest.MITIGATION_REQ_SUCCESSFUL);
    }).catch((error) => {
        console.error()
    })
    );
}

function getStatusString(status) {
    switch (status) {
        case MitigationRequest.MITIGATION_REQ_DECLINED:
            return LOG_MITIGATION_REQ_DECLINED;
        case MitigationRequest.MITIGATION_REQ_ACCEPTED:
            return LOG_MITIGATION_REQ_ACCEPTED;
        case MitigationRequest.MITIGATION_REQ_IN_PROGRESS:
            return LOG_MITIGATION_REQ_IN_PROGRESS;
        case MitigationRequest.MITIGATION_REQ_SUCCESSFUL:
            return LOG_MITIGATION_REQ_SUCCESSFUL;
        case MitigationRequest.NEW_MITIGATION_REQ:
            return LOG_NEW_MITIGATION_REQ;
        case RequestMitigation.NEW_ALARM:
            return LOG_NEW_ALARM;
        case RequestMitigation.ALARM_IGNORED:
            return LOG_ALARM_IGNORED;
        case RequestMitigation.REQ_MITIGATION_REQUESTED:
            return LOG_REQ_MITIGATION_REQUESTED;
        case RequestMitigation.REQ_MITIGATION_ACCEPTED:
            return LOG_REQ_MITIGATION_ACCEPTED;
        case RequestMitigation.REQ_MITIGATION_IN_PROGRESS:
            return LOG_REQ_MITIGATION_IN_PROGRESS;
        case RequestMitigation.REQ_MITIGATION_DECLINED:
            return LOG_REQ_MITIGATION_DECLINED;
        case RequestMitigation.REQ_MITIGATION_SUCCESSFUL:
            return LOG_REQ_MITIGATION_SUCCESSFUL;
        default:
            return 'no status recognized';
    }
}
