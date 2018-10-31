const logger = require('./logger');
const ssh2shell = require('ssh2shell');


// Function to retrieve the serviceName status on the controller configured in .env
// function getServiceStatus(serviceName) {
//     try {
//         const systemCtlIsActive = require('./ssh/systemctl-is-active');
//         command = ["sudo systemctl is-active " + serviceName];
//         const sshExecutor = require('./sshexecutor')(server = systemCtlIsActive.server, commands = command, msg = systemCtlIsActive.msg, debug = systemCtlIsActive.debug, websocketChannel = 'statusChannel');
//         var sshParamsForStatusRetrieval = sshExecutor.getSshExecutor();
//         sshParamsForStatusRetrieval.onEnd = function (sessionTextt) {
//             if (sessionTextt.includes("inactive")) {
//                 logger.info(serviceName + " is inactive");
//                 io.emit('statusChannel', { [serviceName]: "inactive" });
//             } else if (sessionTextt.includes("active")) {
//                 logger.info(serviceName + " is active");
//                 io.emit('statusChannel', { [serviceName]: "active" });
//             }
//         };
//         var SSH = new ssh2shell(sshParamsForStatusRetrieval);
//         SSH.on('end', function (sessionTextt) {
//             this.emit('msg', sessionTextt);
//             logger.info('we here');
//         })
//         SSH.connect();


//     } catch (error) {
//         logger.error(error);
//     }
// }

// // A function to execute bash commands (cmd)
// // Second argument is used to immediatly trigger a service status update to the front end
// function execSSH(cmd, service) {
//     logger.info(cmd, service);
//     try {
//         const systemctlStatusBloss = require('./ssh/systemctl-status-bloss');
//         const sshExecutor = require('./sshexecutor')(server = systemctlStatusBloss.server, systemctlStatusBloss.commands, systemctlStatusBloss.msg, systemctlStatusBloss.debug, 'statusChannel');
//         var sshparams = sshExecutor.getSshExecutor();
//         sshparams.commands = [cmd];
//         sshparams.onEnd = function (sessionText, sshparams) {
//             logger.info(JSON.stringify(sessionText));
//             if (service != null) {
//                 getServiceStatus(service);
//             }

//             console.log("sessionText is " + sessionText)
//         };
//         var SSH = new ssh2shell(sshparams);
        
//         SSH.connect();
//     } catch (error) {
//         logger.error(error);
//     }
// }



module.exports = function (io) {
    logger.info("Socket Handler invoked");

    // Checks via simple ping -c1 if the configured controller is reachable 
    // (so we won't even try to SSH if it's unreachable)
    var isControllerAvailable = true; // change back to true
    var statusPollingActive = false;

    // This interval trigger a service status update every XX seconds
    // TODO: Create Websocket and control to stop the interval / define thresholds
    // clearInterval(timerID); // The setInterval it cleared and doesn't run anymore.
    // setInterval(function () {
    //     logger.info("Executing getServiceStatus Interval, isControllerAvailable:["+isControllerAvailable+"], statusPollingActive;["+statusPollingActive+"]");            
    //     if (isControllerAvailable && statusPollingActive) {
    //         //getServiceStatus("bloss");
    //         //getServiceStatus("geth");
    //         //getServiceStatus("ipfs");
    //     }else {
    //         if(!isControllerAvailable) {
    //             logger.info("Status Retrieval failed because controller is not reachable");
    //         } else if(!statusPollingActive) {
    //             logger.info("Status Retrieval is deactivated");
    //         } else {
    //             logger.info("something else happened")
    //         }
    //     }
    // }, 15 * 1000);

    io.on('connection', function (socket) {
        logger.info("connection established")

        // console.log("Executing child process");
        // var exec = require('child_process').exec, child;
        // var cmd = 'ping -c 1 ' + process.env.CONTROLLER400;
        // child = exec(cmd, function (error, stdout, stderr) {
        //     if (error !== null) {
        //         isControllerAvailable = false;
        //         //logger.error("Status Retrieval won't start - The controller with IP [" + process.env.CONTROLLER400 + "] is not available");
        //     } else {
        //         isControllerAvailable = true;
        //         //logger.info("Status Retrieval starts - The controller with IP" + process.env.CONTROLLER400 + " is available");
        //     }
        // });

        socket.on('isControllerAvailableRequest', function(data){
            logger.info("isControllerAvailable called");
            //io.emit('isControllerAvailable', { "isControllerAvailable": isControllerAvailable });
        });

        socket.on('statusPolling', function(data){
            statusPollingActive = !statusPollingActive;
            logger.info("statusPollingActive changed to "+statusPollingActive);
            if(!isControllerAvailable){
                logger.info("Controller is not reachable.");
            }
        });

        // Endpoint for starting and stopping systemd services
        socket.on('serviceCtl', function (data) {
            logger.info("serviceCtl called");
            // if (isControllerAvailable) {
            //     switch (data.cmd) {
            //         case 'start':
            //             logger.info("Starting " + JSON.stringify(data.service));
            //             execSSH("sudo systemctl start " + data.service, data.service)
            //             break;
            //         case 'stop':
            //             logger.info("Stopping " + JSON.stringify(data.service));
            //             execSSH("sudo systemctl stop " + data.service, data.service)
            //             break;
            //         default:
            //             logger.error("Something went wrong with this request" + JSON.stringify(data));
            //     }

            // }
        });    
    });
};