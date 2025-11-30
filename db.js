const mysql = require('mysql2');

const pool = mysql.createPool({
  host: 'localhost',
  user: 'studb161',
  password: 'abc123',
  database: 'db161',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

module.exports = pool.promise();
