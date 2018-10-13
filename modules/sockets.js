const logger = require('./logger');
const ssh2shell = require('ssh2shell');

module.exports = function (server) {
    var io = require("socket.io").listen(server);
    io.sockets.on('connection', function (socket) {

        // Checks via simple ping -c1 if the configured controller is reachable 
        // (so we won't even try to SSH if it's unreachable)
        var isControllerAvailable;
        var statusPollingActive = false;

        var exec = require('child_process').exec, child;
        var cmd = 'ping -c 1 ' + process.env.CONTROLLER400;
        child = exec(cmd, function (error, stdout, stderr) {
            if (error !== null) {
                isControllerAvailable = false;
                //logger.error("Status Retrieval won't start - The controller with IP [" + process.env.CONTROLLER400 + "] is not available");
            } else {
                isControllerAvailable = true;
                //logger.info("Status Retrieval starts - The controller with IP" + process.env.CONTROLLER400 + " is available");
            }
        });

        socket.on('statusPolling', function(data){
            statusPollingActive = !statusPollingActive;
            // Emit back? 
        });

        // Endpoint for starting and stopping systemd services
        socket.on('serviceCtl', function (data) {
            if (isControllerAvailable) {
                switch (data.cmd) {
                    case 'start':
                        logger.info("Starting " + JSON.stringify(data.service));
                        execSSH("sudo systemctl start " + data.service, data.service)
                        break;
                    case 'stop':
                        logger.info("Stopping " + JSON.stringify(data.service));
                        execSSH("sudo systemctl stop " + data.service, data.service)
                        break;
                    default:
                        logger.error("Something went wrong with this request" + JSON.stringify(data));
                }

            }
        });

        // This interval trigger a service status update every XX seconds
        // TODO: Create Websocket and control to stop the interval / define thresholds
        // clearInterval(timerID); // The setInterval it cleared and doesn't run anymore.
        setInterval(function () {
            // logger.info(isControllerAvailable);
            if (isControllerAvailable && statusPollingActive) {
                getServiceStatus("bloss");
                getServiceStatus("geth");
                getServiceStatus("ipfs");
            }
        }, 15 * 1000);

        // A function to execute bash commands (cmd)
        // Second argument is used to immediatly trigger a service status update to the front end
        function execSSH(cmd, service) {
            logger.info(cmd, service);
            try {
                const systemctlStatusBloss = require('./ssh/systemctl-status-bloss');
                const sshExecutor = require('./sshexecutor')(server = systemctlStatusBloss.server, systemctlStatusBloss.commands, systemctlStatusBloss.msg, systemctlStatusBloss.debug, 'statusChannel');
                var sshparams = sshExecutor.getSshExecutor();
                sshparams.commands = [cmd];
                sshparams.onEnd = function (sessionText, sshparams) {
                    logger.info(JSON.stringify(sessionText));
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
                logger.error(error);
            }
        }


        // Function to retrieve the serviceName status on the controller configured in .env
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
    });

    return io;
};

