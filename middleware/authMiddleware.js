// roleChecker.js

/**
 * Ellenőrzi, hogy a felhasználó be van-e jelentkezve, 
 * és a szerepköre benne van-e az engedélyezettek listájában.
 * @param {string[]} allowedRoles - A megengedett szerepkörök listája (pl. ['admin', 'registered']).
 */
const authorize = (allowedRoles) => {
    return (req, res, next) => {
        const user = req.session.user;

        // 1. Eset: Nincs bejelentkezve (role: 'látogató'/'guest')
        if (!user) {
            // Ha a "látogató" szerepkör engedélyezett, mehet tovább
            if (allowedRoles.includes('guest')) {
                return next();
            }
            // Különben átirányítás a login oldalra
            req.flash('error', 'Ehhez az oldalhoz bejelentkezés szükséges!');
            return res.redirect('/login');
        }

        // 2. Eset: Be van jelentkezve (role: 'registered' vagy 'admin')
        const userRole = user.role;

        if (allowedRoles.includes(userRole)) {
            // Engedélyezett szerepkör, mehet tovább
            next();
        } else {
            // Nincs jogosultsága
            res.status(403).render('error', { 
                errorCode: 403, 
                message: 'Hozzáférés megtagadva. Nem rendelkezel a megfelelő jogosultsággal.' 
            });
        }
    };
};

module.exports = authorize;