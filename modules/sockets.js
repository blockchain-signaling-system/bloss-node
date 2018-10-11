const logger = require('./logger');
const ssh2shell = require('ssh2shell');

module.exports = function (server) {
    var io = require("socket.io").listen(server);
    io.sockets.on('connection', function (socket) {
        socket.on('getUptime', function (data) {
            socket.emit('messageChannel',
                { hello: 'world2222' });
            logger.info(data);
        });
        
        setInterval(function () {
        logger.info("Starting Status Retrieval")
        // socket.emit('news_by_server', 'Cow goes moo'); 
        //socket.on('getStatus', function (data) {
        try {
        
            const systemctlStatusBloss = require('./ssh/systemctl-status-bloss');
            //console.log(systemctlStatusBloss);
            const sshExecutor = require('./sshexecutor')(server = systemctlStatusBloss.server, systemctlStatusBloss.commands, systemctlStatusBloss.msg, systemctlStatusBloss.debug, 'statusChannel');
            var sshparams = sshExecutor.getSshExecutor();

            sshparams.commands= [
                "pgrep bloss;echo $?bloss",
                "pgrep geth;echo $?geth",
                "pgrep ipfs;echo $?ipfs"
            ];
            
            sshparams.onEnd = function (sessionText, sshparams) {

                var statusMessage = {
                    geth: "",
                    bloss: "",
                    ipfs: "",
                };
                var geth;
    
                if (sessionText.includes("1geth")) {
                    logger.info("GETH: INACTIVE (DEAD)");
                    statusMessage.geth = "INACTIVE (DEAD)";
                } else if (sessionText.includes("0geth")) {
                    logger.info("GETH: ACTIVE (RUNNING)");
                    statusMessage.geth = "ACTIVE (RUNNING)";
                }

                if (sessionText.includes("1bloss")) {
                    logger.info("BLOSS: INACTIVE (DEAD)");
                    statusMessage.bloss = "INACTIVE (DEAD)";
                } else if (sessionText.includes("0bloss")) {
                    logger.info("BLOSS: ACTIVE (RUNNING)");
                    statusMessage.bloss = "ACTIVE (RUNNING)";
                }

                if (sessionText.includes("1ipfs")) {
                    logger.info("IPFS: INACTIVE (DEAD)");
                    statusMessage.ipfs = "INACTIVE (DEAD)";
                } else if (sessionText.includes("0ipfs")) {
                    logger.info("IPFS: ACTIVE (RUNNING)");
                    statusMessage.ipfs = "ACTIVE (RUNNING)";
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
        //});
        }, 30 * 1000);

        // clearInterval(timerID); // The setInterval it cleared and doesn't run anymore.

    });

    return io;
};

