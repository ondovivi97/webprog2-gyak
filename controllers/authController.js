const db = require("../db");
const bcrypt = require("bcrypt");

// REGISZTRÁCIÓ
exports.registerUser = async (req, res) => {
    const { username, jelszo, jelszo2 } = req.body;

    let errors = [];

    if (!username || !jelszo) {
        errors.push("Minden mezőt ki kell tölteni!");
    }

    if (jelszo !== jelszo2) {
        errors.push("A két jelszó nem egyezik!");
    }

    if (errors.length > 0) {
        return res.render("regisztracio", {
            errors,
            values: { username }
        });
    }

    try {
        // Meglévő felhasználó ellenőrzése
        const [existing] = await db.query(
            "SELECT * FROM users WHERE username = ?",
            [username]
        );

        if (existing.length > 0) {
            return res.render("regisztracio", {
                errors: ["A felhasználónév már foglalt!"],
                values: { username }
            });
        }

        // Jelszó hash
        const hashed = await bcrypt.hash(jelszo, 10);

        // Mentés
        await db.query(
            "INSERT INTO users (username, password, role) VALUES (?, ?, 'user')",
            [username, hashed]
        );

        res.render("regisztracio", {
            success: "Sikeres regisztráció! Jelentkezz be!",
            errors: [],
            values: {}
        });

    } catch (err) {
        console.error(err);
        res.send("Hiba történt a regisztráció során.");
    }
};

// BEJELENTKEZÉS
exports.loginUser = async (req, res) => {
    const { email: username, jelszo } = req.body; // email meződ valójában username!

    let errors = [];

    try {
        // Felhasználó lekérdezése
        const [rows] = await db.query(
            "SELECT * FROM users WHERE username = ?",
            [username]
        );

        if (rows.length === 0) {
            errors.push("Nincs ilyen felhasználó!");
            return res.render("login", { errors, success: null, values: {} });
        }

        const user = rows[0];

        // Jelszó ellenőrzése
        const ok = await bcrypt.compare(jelszo, user.password);

        if (!ok) {
            errors.push("Hibás jelszó!");
            return res.render("login", { errors, success: null, values: {} });
        }

        // SESSION létrehozása
        req.session.user = {
            id: user.id,
            username: user.username,
            role: user.role
        };

        res.redirect("/");
    } catch (err) {
        console.error(err);
        res.send("Hiba történt a bejelentkezés során.");
    }
};

// KIJELENTKEZÉS
exports.logoutUser = (req, res) => {
    req.session.destroy(() => res.redirect("/"));
};
