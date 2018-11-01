const ssh2shell = require('ssh2shell');

var isControllerAvailable = false; // change back to false

module.exports = function (server) {
    var io = require("socket.io").listen(server);
    io.sockets.on('connection', function (socket) {
        console.info("New connection established.");

        var statusPollingActive = false;

        socket.on('isControllerAvailable', function (data) {
            console.info("isControllerAvailable called");
            socket.emit('isControllerAvailable', { "isControllerAvailable": isControllerAvailable });
        });

        socket.on('statusPolling', function (data) {
            statusPollingActive = !statusPollingActive;
            console.info("statusPollingActive changed to " + statusPollingActive);
            if (!isControllerAvailable) {
                console.info("Controller is not reachable.");
            }
        });

        // Endpoint for starting and stopping systemd services
        socket.on('serviceCtl', function (data) {
            if (isControllerAvailable) {
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

        // This interval trigger a service status update every XX seconds
        // TODO: Create Websocket and control to stop the interval / define thresholds
        // clearInterval(timerID); // The setInterval it cleared and doesn't run anymore.
        setInterval(function () {
            //console.info("Executing getServiceStatus Interval, isControllerAvailable:["+isControllerAvailable+"], statusPollingActive;["+statusPollingActive+"]");            
            if (isControllerAvailable && statusPollingActive) {
                // getServiceStatus("bloss");
                // getServiceStatus("geth");
                // getServiceStatus("ipfs");
            } else {
                if (!isControllerAvailable)
                    console.info("Status Retrieval failed because controller is not reachable");
                else if (!statusPollingActive)
                    console.info("Status Retrieval is deactivated");
            }
        }, 15 * 1000);

        // A function to execute bash commands (cmd)
        // Second argument is used to immediatly trigger a service status update to the front end
        function execSSH(cmd, service) {
            console.info("ExecSSH invoked.");
            console.info(cmd, service);
            try {
                const systemctlStatusBloss = require('./ssh/systemctl-status-bloss');
                const sshExecutor = require('./sshexecutor')(server = systemctlStatusBloss.server, systemctlStatusBloss.commands, systemctlStatusBloss.msg, systemctlStatusBloss.debug, 'statusChannel');
                var sshparams = sshExecutor.getSshExecutor();
                sshparams.commands = [cmd];
                sshparams.onEnd = function (sessionText, sshparams) {
                    console.info(JSON.stringify(sessionText));
                    if (service != null) {
                        getServiceStatus(service);
                    }
                };
                var SSH = new ssh2shell(sshparams);
                // SSH.on('end', function (sessionText, sshparams) {
                //     this.emit('msg', sessionText);
                // })
                SSH.connect();
            } catch (error) {
                console.error(error);
            }
        }


        // Function to retrieve the serviceName status on the controller configured in .env
        function getServiceStatus(serviceName) {
            console.info("getServiceStatus invoked.");
            try {
                const systemCtlIsActive = require('./ssh/systemctl-is-active');
                var command = ["sudo systemctl is-active " + serviceName];
                const sshExecutor = require('./sshexecutor')(server = systemCtlIsActive.server, commands = command, msg = systemCtlIsActive.msg, debug = systemCtlIsActive.debug, websocketChannel = 'statusChannel');
                var sshParamsForStatusRetrieval = sshExecutor.getSshExecutor();
                sshParamsForStatusRetrieval.onEnd = function (sessionTextt) {
                    if (sessionTextt.includes("inactive")) {
                        console.info(serviceName + " is inactive");
                        socket.emit('statusChannel', { [serviceName]: "inactive" });
                    } else if (sessionTextt.includes("active")) {
                        console.info(serviceName + " is active");
                        socket.emit('statusChannel', { [serviceName]: "active" });
                    }
                };
                var SSH = new ssh2shell(sshParamsForStatusRetrieval);
                SSH.on('end', function (sessionTextt) {
                    this.emit('msg', sessionTextt);
                    console.info('we here');
                })
                SSH.connect();
            } catch (error) {
                console.error(error);
            }
        }
    });

    return io;
};