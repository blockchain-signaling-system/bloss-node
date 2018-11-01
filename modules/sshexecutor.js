class SSHExecutor {
    constructor(server,commands,msg,debug,websocketChannel) {
        this.server = server;
        this.commands = commands;
        this.msg = msg;
        this.debug = debug;
        this.websocketChannel = websocketChannel;
    }
    getSshExecutor() {
        var hosts = { };     
        hosts = {
            server: this.server,
            commands: this.commands,
            msg: this.msg,
            debug: this.debug
        };
        return hosts;
        
    }
}

module.exports = (server,commands,msg,debug,websocketChannel) =>{ return new SSHExecutor(server,commands,msg,debug,websocketChannel)}
