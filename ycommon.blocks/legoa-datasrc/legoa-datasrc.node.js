/* jshint node:true */
/* global modules:false */

(function() {

var PATH = require('path');

modules.define(
    'legoa-datasrc',
    ['file-provider', 'yana-config', 'yana-error_type_http'],
    function(provide, fileProvider, config, HttpError) {

var datasrc = config.hosts.datasrc;

provide({

    _buildPath : function(params) {
        var lib = params.lib,
            block = params.block;
        return PATH.join(datasrc.root, '_' + lib, 'blocks', block + '.json');
    },

    blockInfo : function(params) {
        var path = this._buildPath(params);
        return fileProvider.create({ path : path, dataType : 'json' })
            .run()
            .fail(function(err) {
                var message = 'Block "' + params.block + '" for library "' + params.lib + '" not found';
                throw new HttpError(404, message);
            });
    }

});

});

}());