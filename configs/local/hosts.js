var PATH = require('path'),
    appRoot = PATH.resolve(__dirname, '../../');

module.exports = {
    blackbox : {
        host : '/blackbox',
        domain : 'yandex-team.ru'
    },
    passport : {
        host : 'http://passport.yandex-team.ru'
    },
    center : {
        host : 'http://center.yandex-team.ru'
    },
    static : {
        host : 'http://127.0.0.1:8001'
    },
    datasrc : {
        host : '/datasrc',
        root : PATH.join(appRoot, 'datasrc')
    }
};
