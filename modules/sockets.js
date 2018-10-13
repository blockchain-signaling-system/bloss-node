const logger = require('./logger');
const ssh2shell = require('ssh2shell');

module.exports = function (server) {
    var io = require("socket.io").listen(server);
    io.sockets.on('connection', function (socket) {
        
        var isControllerAvailable;
        var exec = require('child_process').exec, child;
        var cmd = 'ping -c 1 ' + process.env.CONTROLLER400;
        child = exec(cmd, function (error, stdout, stderr) {
            if (error !== null) {
                isControllerAvailable = false;
                logger.error("Status Retrieval won't start - The controller with IP [" + process.env.CONTROLLER400 + "] is not available");
            } else {
                isControllerAvailable = true;
                logger.info("Status Retrieval starts - The controller with IP" + process.env.CONTROLLER400 + " is available");
            }
        });

        socket.on('getUptime', function (data) {
            socket.emit('messageChannel',
                { hello: 'world2222' });
            logger.info(data);
        });

        socket.on('serviceCtl', function (data) {
            if (isControllerAvailable) {
                switch (data.cmd) {
                    case 'start':
                        logger.info("Starting " + JSON.stringify(data.service));
                        execSSH("sudo systemctl start " + data.service,data.service)
                        break;
                    case 'stop':
                        logger.info("Stopping " + JSON.stringify(data.service));
                        execSSH("sudo systemctl stop " + data.service,data.service)
                        break;
                    default:
                        logger.error("Something went wrong with this request" + JSON.stringify(data));
                }

            }
        });

        function execSSH(cmd,service) {
            logger.info(cmd,service);
            try {
                const systemctlStatusBloss = require('./ssh/systemctl-status-bloss');
                const sshExecutor = require('./sshexecutor')(server = systemctlStatusBloss.server, systemctlStatusBloss.commands, systemctlStatusBloss.msg, systemctlStatusBloss.debug, 'statusChannel');
                var sshparams = sshExecutor.getSshExecutor();
                sshparams.commands = [cmd];
                sshparams.onEnd = function (sessionText, sshparams) {
                    logger.info(JSON.stringify(sessionText));
                    getServiceStatus(service);
                };
                var SSH = new ssh2shell(sshparams);
                SSH.on('end', function (sessionText, sshparams) {
                    this.emit('msg', sessionText);
                })
                SSH.connect();
            } catch (error) {
                logger.error(error);
            }
        }

        setInterval(function () {
            logger.info(isControllerAvailable);
            if (isControllerAvailable) {
                getServiceStatus("bloss");
                getServiceStatus("geth");
                getServiceStatus("ipfs");
            }
        }, 15 * 1000);

        // TODO: Create Websocket and control to stop the interval / define thresholds
        // clearInterval(timerID); // The setInterval it cleared and doesn't run anymore.

        function getServiceStatus(serviceName) {
            try {
                const systemCtlIsActive = require('./ssh/systemctl-is-active');
                command = ["sudo systemctl is-active " + serviceName];
                const sshExecutor = require('./sshexecutor')(server = systemCtlIsActive.server, commands = command, msg = systemCtlIsActive.msg, debug = systemCtlIsActive.debug, websocketChannel = 'statusChannel');
                var sshParamsForStatusRetrieval = sshExecutor.getSshExecutor();
                sshParamsForStatusRetrieval.onEnd = function (sessionTextt) {
                    if (sessionTextt.includes("inactive")) {
                        logger.info(serviceName + " is inactive");                  
                        socket.emit('statusChannel', { [serviceName]: "inactive" });
                    } else if (sessionTextt.includes("active")) {
                        logger.info(serviceName + " is active");
                        socket.emit('statusChannel', { [serviceName]: "active" });
                    }
                };
                var SSH = new ssh2shell(sshParamsForStatusRetrieval);
                SSH.on('end', function (sessionTextt) {
                    this.emit('msg', sessionTextt);
                    logger.info('we here');
                })
                SSH.connect();


            } catch (error) {
                logger.error(error);
            }
        }

        function execStatusPolling2() {
            try {
                const systemctlStatusBloss = require('./ssh/systemctl-status-bloss');
                // logger.info(systemctlStatusBloss);
                const sshExecutor = require('./sshexecutor')(server = systemctlStatusBloss.server, systemctlStatusBloss.commands, systemctlStatusBloss.msg, systemctlStatusBloss.debug, 'statusChannel');
                var sshparams = sshExecutor.getSshExecutor();

                sshparams.commands = [
                    "pgrep bloss;echo $?bloss",
                    "pgrep geth;echo $?geth",
                    "pgrep ipfs;echo $?ipfs"
                ];

                sshparams.onEnd = function (sessionText, sshparams) {

                    var statusMessage = {
                        bloss: false,
                        geth: false,
                        ipfs: false
                    };

                    if (sessionText.includes("1geth")) {
                        logger.info("GETH: INACTIVE (DEAD)");
                        //statusMessage.geth = "INACTIVE (DEAD)";
                        //statusMessage.geth = false;
                    } else if (sessionText.includes("0geth")) {
                        logger.info("GETH: ACTIVE (RUNNING)");
                        //statusMessage.geth = "ACTIVE (RUNNING)";
                        statusMessage.geth = true;
                    }
                    if (sessionText.includes("1bloss")) {
                        logger.info("BLOSS: INACTIVE (DEAD)");
                        //statusMessage.bloss = "INACTIVE (DEAD)";
                    } else if (sessionText.includes("0bloss")) {
                        logger.info("BLOSS: ACTIVE (RUNNING)");
                        //statusMessage.bloss = "ACTIVE (RUNNING)";
                        statusMessage.bloss = true;
                    }

                    if (sessionText.includes("1ipfs")) {
                        logger.info("IPFS: INACTIVE (DEAD)");
                        //statusMessage.ipfs = "INACTIVE (DEAD)";
                        //statusMessage.ipfs = "INACTIVE (DEAD)";
                    } else if (sessionText.includes("0ipfs")) {
                        logger.info("IPFS: ACTIVE (RUNNING)");
                        //statusMessage.ipfs = "ACTIVE (RUNNING)";
                        statusMessage.ipfs = true;
                    }

                    // EXIT STATUS
                    // 0 One or more processes matched the criteria.
                    // 1 No processes matched.
                    // 2 Syntax error in the command line.
                    // 3 Fatal error: out of memory etc.
                    logger.info(JSON.stringify(statusMessage));
                    socket.emit('statusChannel', { status: statusMessage });
                    // logger.info(this.emit("msg", "\nThis is the full session response:\n\n" + sessionText + "\n\n"));
                    logger.info(JSON.stringify(sessionText));
                };

                var SSH = new ssh2shell(sshparams);
                SSH.on('end', function (sessionText, sshparams) {
                    this.emit('msg', sessionText);
                    logger.info('we here');
                })
                SSH.connect();

            } catch (error) {
                logger.error(error);
            }
        }
    });

    return io;
};

