
const logger = require('../logger');

module.exports = {
    server: {
        host: process.env.CONTROLLER400,
        port: process.env.SSH_PORT,
        userName: process.env.SSH_USER,
        //password: process.env.SSH_PW not needed as of now
        privateKey: require('fs').readFileSync(process.env.SSH_KEY)
    },
    msg: {
        send: function (message) {
            logger.info(process.env.SSH_USER + '@' + process.env.CONTROLLER400 + ' ' + message);
        }
    },
    debug: false
}
