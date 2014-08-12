var path = require('path'),

    vow = require('vow'),
    vowFs = require('vow-fs'),

    cronJob = require('cron').CronJob,

    config = require('./config'),
    providers = require('../data/providers');

var job,
    marker;

module.exports = {

    /**
     * Initialize update cron job without starting
     * @param master - {Object} master process of cluster
     * @returns {exports}
     */
    init: function(master) {
        providers.getProviderYaDisk().init();

        job = new cronJob({
            cronTime: config.get('app:update:cron'),
            onTick: function() { checkForUpdate(master) },
            start: false
        });

        return this;
    },

    /**
     * Starts cron job for data update
     * @returns {exports}
     */
    start: function() {
        job.start();
        return this;
    }
};

/**
 * Clear and create empty cache folders
 * @param dir - {String} name of cache folder
 * @returns {*}
 */
var clearCache = function(dir) {
    console.info('clear cache start');
    return providers.getProviderFile()
        .removeDir({ path: dir })
        .then(function() {
            return vow.all([
                vowFs.makeDir(path.join(dir, 'branch')),
                vowFs.makeDir(path.join(dir, 'tag'))
            ]);
        });
};

/**
 * Remove files from local filesystem
 * @param dtp - {String} path to data file on local filesystem
 * @param stp - {String} path to sitemap.xml file on local filesystem
 * @returns {*}
 */
var removeFiles = function(dtp, stp) {
    console.info('remove files start');
    return vow.all([
        providers.getProviderFile().remove({ path: dtp }),
        providers.getProviderFile().remove({ path: stp })
    ]);
};

/**
 * Downloads files from Yandex Disk to local filesystem
 * @param dsp - {String} path to data file on Yandex Disk
 * @param dtp - {String} path to data file on local filesystem
 * @param ssp - {String} path to sitemap.xml file on Yandex Disk
 * @param stp - {String} path to sitemap.xml file on local filesystem
 * @returns {*}
 */
var downloadFiles = function(dsp, dtp, ssp, stp) {
    console.info('download files start');
    return vow.all([
        providers.getProviderYaDisk().downloadFile({ source: dsp, target: dtp }),
        providers.getProviderYaDisk().downloadFile({ source: ssp, target: stp })
    ]);
};

/**
 * Loads marker file from local filesystem or Yandex Disk depending on enviroment
 * Compare sha sums of data object with sums of previous check
 * If these sums are different then restart all cluster workers
 * @param master - {Object} master process
 * @returns {*}
 */
var checkForUpdate = function(master) {
    console.info('Check for update for master process start');

    var yaDiskDirectory = config.get('common:model:dir'),
        dataFileName = config.get('common:model:data'),
        env = config.get('NODE_ENV'),
        dataSourcePath = path.join(yaDiskDirectory, env, dataFileName),
        dataTargetPath = path.join(process.cwd(),'backups', dataFileName),
        sitemapSourcePath = path.join(yaDiskDirectory, env, 'sitemap.xml'),
        sitemapTargetPath = path.join(process.cwd(), 'sitemap.xml');

    return providers.getProviderYaDisk().load({
            path: path.join(yaDiskDirectory, env, config.get('common:model:marker'))
        })
        .then(function (content) {
            return JSON.parse(content);
        })
        .then(function(content) {
            if(!content) {
                return;
            }

            //marker is not exist for first check operation
            if(!marker) {
                marker = content;
                return;
            }

            //compare sha sums for data objects
            if(marker.data === content.data) {
                return;
            }

            marker = content;

            return clearCache(path.join(process.cwd(), 'cache'))
                .then(function() {
                    return removeFiles(dataTargetPath, sitemapTargetPath);
                })
                .then(function() {
                    return downloadFiles(dataSourcePath, dataTargetPath, sitemapSourcePath, sitemapTargetPath);
                })
                .then(function() {
                    console.info('restart workers ...');
                    return master.softRestart();
                });

        })
        .fail(function() {
            console.error('Error occur while loading and parsing marker file');
        });
};

