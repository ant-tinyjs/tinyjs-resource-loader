var fs = require('graceful-fs');
var path = require('path');
var fse = require('fs-extra');
var Promise = require('bluebird');
var PngQuant = require('pngquant');

module.exports = function (source, dest, colors) {
  fse.ensureDirSync(path.dirname(dest));
  return new Promise(function (resolve, reject) {
    var readStream = fs.createReadStream(source);
    var writeStream = fs.createWriteStream(dest);

    if (colors) {
      var pngquant = new PngQuant([colors]);
      readStream.pipe(pngquant).pipe(writeStream);
    } else {
      readStream.pipe(writeStream);
    }

    readStream.on('error', function (error) {
      reject(error);
    });
    writeStream.on('finish', function () {
      resolve();
    });
  });
};
