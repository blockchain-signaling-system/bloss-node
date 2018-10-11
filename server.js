'use strict'

/**
* Module dependencies.
*/
const express = require('express');
const logger = require('./modules/logger');
const http = require('http');
const socketio = require('socket.io');
const dotenv = require('dotenv');
const ssh2shell = require('ssh2shell');

/**
 * Start message
 */
logger.info('Starting BloSS collector')
logger.info('Listening on PORT: ' + process.env.WS_PORT);

/**
 * Load environment variables from .env file
 */
dotenv.load({ path: '.env' });

/**
* Create Express Server, http server and socket.io 
*/
const app = express();
const server = http.Server(app);
server.listen(process.env.WS_PORT);
var io = require("./modules/sockets")(server);
