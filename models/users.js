// models/users.js
const db = require('../db');

module.exports = {
    // felhasználó keresése felhasználónév alapján
    findByUsername: async function(username) {
        const [rows] = await db.execute(
            "SELECT * FROM users WHERE username = ? LIMIT 1",
            [username]
        );
        return rows.length > 0 ? rows[0] : null;
    },

    // új felhasználó létrehozása
    createUser: async function(username, password_hash, role = "registered") {
        await db.execute(
            "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)",
            [username, password_hash, role]
        );
    },

    getAllUsers: async function() {
        const [rows] = await db.execute("SELECT id, username, role FROM users");
        return rows;
    }
};
