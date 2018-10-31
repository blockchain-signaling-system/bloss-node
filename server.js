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

const socketHandler = require("./modules/sockets");


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
//app.use(bodyParser.json({ strict: false }));
const server = http.Server(app);
server.listen(process.env.WS_PORT);
var io = require("socket.io")(server);

io.on('connection', function (socket) {
    console.info("connection established")

    socket.on('isControllerAvailableRequest', function(data){
        console.info("isControllerAvailable called");
    });

    socket.on('statusPolling', function(data){
        console.info("status polling");
    });

    socket.on('serviceCtl', function (data) {
        console.info("serviceCtl called");
    });    
});