var vendor = require('postcss/lib/vendor');

var mapFunctions = require('./lib/mapFunctions');
var parseBytes = require('./lib/parseBytes');
var unescapeCss = require('./lib/unescapeCss');

var fs = require('fs');
var path = require('path');
var url = require('url');

var base64 = require('js-base64').Base64;
var cssesc = require('cssesc');
var mime = require('mime');
var sizeOf = require('image-size');

module.exports = function (options) {

  options = options || {};
  options.baseUrl = options.baseUrl || '/';

  if (options.basePath) {
    options.basePath = path.resolve(options.basePath);
  } else {
    options.basePath = process.cwd();
  }

  if (options.loadPaths) {
    options.loadPaths = options.loadPaths.map(function (loadPath) {
      return path.resolve(options.basePath, loadPath);
    });
  } else {
    options.loadPaths = [];
  }
  options.loadPaths.unshift(options.basePath);

  if (options.relativeTo) {
    options.relativeTo = path.resolve(options.relativeTo);
  } else {
    options.relativeTo = false;
  }

  function getImageSize(assetStr, density) {
    var assetPath = resolvePath(assetStr.value);
    var size;
    try {
      size = sizeOf(assetPath);
      if (typeof density !== 'undefined') {
        density = parseFloat(density.value, 10);
        console.log(density);
        size.width  = +(size.width  / density).toFixed(4);
        size.height = +(size.height / density).toFixed(4);
      }
      return size;
    } catch (exception) {
      var err = new Error("Image corrupted: " + assetPath);
      err.name = 'ECORRUPT';
      throw err;
    }
  }

  function matchPath(assetPath) {
    var exception, matchingPath;
    var isFound = options.loadPaths.some(function (loadPath) {
      matchingPath = path.join(loadPath, assetPath);
      return fs.existsSync(matchingPath);
    });
    if (!isFound) {
      exception = new Error("Asset not found or unreadable: " + assetPath);
      exception.name = 'ENOENT';
      throw exception;
    }
    return matchingPath;
  }

  function resolveDataUrl(assetStr) {
    var resolvedPath = resolvePath(assetStr);
    var mimeType = mime.lookup(resolvedPath);
    if (mimeType === 'image/svg+xml') {
      var data = cssesc(fs.readFileSync(resolvedPath).toString());
      var encoding = 'utf8';
    } else {
      data = base64.encode(fs.readFileSync(resolvedPath));
      encoding = 'base64';
    }
    return 'data:' + mimeType + ';' + encoding + ',' + data;
  }

  function resolvePath(assetStr) {
    var assetUrl = url.parse(unescapeCss(assetStr));
    var assetPath = decodeURI(assetUrl.pathname);
    return matchPath(assetPath);
  }

  function resolveUrl(assetStr) {
    var assetUrl = url.parse(unescapeCss(assetStr));
    var assetPath = decodeURI(assetUrl.pathname);
    if (options.relativeTo) {
      assetUrl.pathname = path.relative(options.relativeTo, matchPath(assetPath));
    } else {
      var baseToAsset = path.relative(options.basePath, matchPath(assetPath));
      assetUrl.pathname = url.resolve(options.baseUrl, baseToAsset);
    }
    return cssesc(url.format(assetUrl));
  }

  return function (cssTree) {
    cssTree.eachDecl(function (decl) {
      try {
        decl.value = mapFunctions(decl.value, {
          'url': function (assetStr) {
            assetStr.value = resolveUrl(assetStr.value);
            return 'url(' + assetStr + ')';
          },

          'inline': function (assetStr) {
            assetStr.value = resolveDataUrl(assetStr.value);
            return 'url(' + assetStr + ')';
          },

          'width': function (assetStr, density) {
            return getImageSize(assetStr, density).width  + 'px';
          },

          'height': function (assetStr, density) {
            return getImageSize(assetStr, density).height + 'px';
          },

          'size': function (assetStr, density) {
            var size = getImageSize(assetStr, density);
            return size.width + 'px ' + size.height + 'px';
          }
        });
      } catch (exception) {
        switch (exception.name) {
        case 'ECORRUPT':
          console.warn(exception.message);
          break;
        case 'ENOENT':
          console.warn('%s\nLoad paths:\n  %s', exception.message, options.loadPaths.join('\n  '));
          break;
        default:
          throw exception;
        }
      }
    });
  };
};
