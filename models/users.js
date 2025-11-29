const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    // ... egyéb mezők (név, email, jelszó, stb.) ...
    
    role: {
        type: String,
        enum: ['admin', 'registered'], // Csak ez a két érték lehet az adatbázisban
        default: 'registered' // Alapértelmezett beállítás regisztrációnál
    },

    // ...
});

module.exports = mongoose.model('User', UserSchema);