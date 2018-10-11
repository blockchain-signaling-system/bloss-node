'use strict'
const fs = require('fs');
const path = require('path');
require('dotenv').config();
const { createLogger, format, transports } = require('winston');
require('winston-daily-rotate-file');

// Create the log directory if it does not exist
if (!fs.existsSync(process.env.LOG_DIR)) {
	fs.mkdirSync(process.env.LOG_DIR);
}

const dailyRotateFileTransport = new transports.DailyRotateFile({
	filename: `${process.env.LOG_DIR}/%DATE%-combined.log`,
	datePattern: 'YYYY-MM-DD'
  });
  

const filename_combined = path.join(process.env.LOG_DIR, 'combined.log');
const filename_error = path.join(process.env.LOG_DIR, 'error.log');

const logger = createLogger({
	// change level if in dev environment versus production
	level: process.env.NODE_ENV === 'development' ? 'verbose' : 'info',
	format: format.combine(
	  format.timestamp({
		format: 'YYYY-MM-DD HH:mm:ss'
	  }),
	  format.printf(info => `${info.timestamp} ${info.level}: ${info.message}`)
	),
	transports: [
	  new transports.Console({
		level: 'info',
		format: format.combine(
		  format.colorize(),
		  format.printf(
			info => `${info.timestamp} ${info.level}: ${info.message}`
		  )
		)
	  }),
	  dailyRotateFileTransport
	]
  });
  
module.exports = logger;