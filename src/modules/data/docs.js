'use strict';

var u = require('util'),
    path = require('path'),

    vow = require('vow'),
    _ = require('lodash'),

    util = require('../../util'),
    logger = require('../../logger')(module),
    config = require('../../config'),

    common = require('./common');

var collectedAuthors,
    collectedTranslators,
    collectedTags,

    tagUrls = {};

var MSG = {
    ERR: {
        NOT_EXIST: '%s file does not exist for source user: %s repo: %s ref: %s path: %s',
        PARSING_ERROR: '%s file parsed with error for source user: %s repo: %s ref: %s path: %s'
    },
    WARN: {
        DEPRECATED: 'remove deprecated field %s for source user: %s repo: %s ref: %s path: %s'
    }
};

var BACKUPS = {
    DIRECTORY: 'backups',
    DOCS: 'docs.json'
};

module.exports = {

    load: function(nodesWithSource) {
        logger.info('Load all docs start');

        var forceUpdate = config.get('forceUpdate');

        common.loadData(common.PROVIDER_FILE, {
            path: path.join(BACKUPS.DIRECTORY, BACKUPS.DOCS)
        })
        .then(function(backup) {

            if(!backup) {
                backup = {
                    docs: {},
                    collectedAuthors: [],
                    collectedTranslators: [],
                    collectedTags: []
                };
            }

            collectedAuthors = forceUpdate ? [] : backup.collectedAuthors;
            collectedTranslators = forceUpdate ? [] : backup.collectedTranslators;
            collectedTags = forceUpdate ? [] : backup.collectedTags;

            var promises = nodesWithSource.map(function(node){
                logger.verbose('Load source for node with url %s %s', node.url, node.source);

                if(!forceUpdate && backup.docs[node.id]) {
                    node.source = backup.docs[node.id];
                    return { id: node.id, source: node.source }
                }

                return vow
                    .allResolved({
                        metaEn: common.loadData(common.PROVIDER_GITHUB_API, {
                            repository: common.getRepoFromSource(node.source, 'en.meta.json')
                        }),
                        metaRu: common.loadData(common.PROVIDER_GITHUB_API, {
                            repository: common.getRepoFromSource(node.source, 'ru.meta.json')
                        }),
                        mdEn: common.loadData(common.PROVIDER_GITHUB_API, {
                            repository: common.getRepoFromSource(node.source, 'en.md')
                        }),
                        mdRu: common.loadData(common.PROVIDER_GITHUB_API, {
                            repository: common.getRepoFromSource(node.source, 'ru.md')
                        })
                    })
                    .then(function(value) {
                        node.source = {
                            en: getSourceFromMetaAndMd(value.metaEn._value, value.mdEn._value),
                            ru: getSourceFromMetaAndMd(value.metaRu._value, value.mdRu._value)
                        };

                        return { id: node.id, source: node.source };
                    });
            });

            return vow.allResolved(promises).then(createDocsBackup);
        });
    },

    reloadAll: function() {
        logger.info('Reload all resources start');
        //TODO implement this
    },

    reload: function(source) {
        logger.info('Reload resource %s start', source);
        //TODO implement this
    },

    /**
     * Returns array of collected authors from docs meta-information without dublicates
     * @returns {Array}
     */
    getAuthors: function() {
        return collectedAuthors;
    },

    /**
     * Returns array of collected translators from docs meta-information without dublicates
     * @returns {Array}
     */
    getTranslators: function() {
        return collectedTranslators;
    },

    /**
     * Returns array of collected tags from docs meta-information without dublicates
     * @returns {Array}
     */
    getTags: function() {
        return collectedTags;
    },

    getTagUrls: function() {
        return tagUrls;
    }
};

/**
 * Post-processing meta-information and markdown contents
 * Merge them into one object.
 * Remove deprecated fields from meta-information
 * Collect tags, authors and translators for advanced people loading
 * Create url for repo issues and prose.io
 * @param meta - {Object} object with .meta.json file information
 * @param md - {Object} object with .md file information
 * @returns {*}
 */
var getSourceFromMetaAndMd = function(meta, md) {
    var repo = meta.repo;

    logger.verbose('loaded data from repo user: %s repo: %s ref: %s path: %s', repo.user, repo.repo, repo.ref, repo.path);

    //verify if md file content exists and valid
    try {
        if(!md.res) {
            logger.error(MSG.ERR.NOT_EXIST, 'md', repo.user, repo.repo, repo.ref, repo.path);
            md = null;
        }else {
            _.extend(repo, { path: md.res.path });
            md = (new Buffer(md.res.content, 'base64')).toString();
            md = util.mdToHtml(md);
        }
    } catch(err) {
        logger.error(MSG.ERR.PARSING_ERROR, 'md', repo.user, repo.repo, repo.ref, repo.path);
        md = null;
    }

    //verify if meta.json file content exists and valid
    try {
        if(!meta.res) {
            logger.error(MSG.ERR.NOT_EXIST, 'meta', repo.user, repo.repo, repo.ref, repo.path);
            return null;
        }

        meta = (new Buffer(meta.res.content, 'base64')).toString();
        meta = JSON.parse(meta);

    } catch(err) {
        logger.error(MSG.ERR.PARSING_ERROR, 'meta', repo.user, repo.repo, repo.ref, repo.path);
        return null;
    }

    //set md inton content field of meta information
    meta.content = md;

    //parse date from dd-mm-yyyy format into milliseconds
    if(meta.createDate) {
        meta.createDate = util.dateToMilliseconds(meta.createDate);
    }

    //parse date from dd-mm-yyyy format into milliseconds
    if(meta.editDate) {
        meta.editDate = util.dateToMilliseconds(meta.editDate);
    }

    //set repo information
    meta.repo = {
        issue: u.format("https://%s/%s/%s/issues/new?title=Feedback+for+\"%s\"",
            repo.host, repo.user, repo.repo, meta.title),
        prose: u.format("http://prose.io/#%s/%s/edit/%s/%s",
            repo.user, repo.repo, repo.ref, repo.path)
    };

    //collect authors
    if(meta.authors && _.isArray(meta.authors)) {
        meta.authors = _.compact(meta.authors);
        collectedAuthors = _.union(collectedAuthors, meta.authors);
    }

    //collect translators
    if(meta.translators && _.isArray(meta.translators)) {
        meta.translators = _.compact(meta.translators);
        collectedTranslators = _.union(collectedTranslators, meta.translators);
    }

    //collect tags
    if(meta.tags) {
        collectedTags = _.union(collectedTags, meta.tags);
    }

    /** fallbacks **/
    ['type', 'root', 'categories', 'order', 'url', 'slug'].forEach(function(field) {
        if(meta[field]) {
            //TODO uncomment it for warnings
            //logger.warn(MSG.WARN.DEPRECATED, field, repo.user, repo.repo, repo.ref, repo.path);
            delete meta[field];
        }
    });
    /** end of fallbacks **/

    return meta;
};

/**
* Creates backup object and save it into json file
* @param res - {Object} object with fields:
* - id {String} unique id of node
* - source {Object} source of node
*/
var createDocsBackup = function(res) {
    logger.info('create backup files for documentation');

    //backup loaded data into file
    return common.saveData(common.PROVIDER_FILE, {
        path: path.join(BACKUPS.DIRECTORY, BACKUPS.DOCS),
        data: {
            docs: res.reduce(function(prev, item) {
                item = item._value || item;

                prev[item.id] = item.source;
                return prev;
            }, {}),
            collectedAuthors: collectedAuthors,
            collectedTranslators: collectedTranslators,
            collectedTags: collectedTags
        }
    });
};






