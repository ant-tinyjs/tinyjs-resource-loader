var path = require('path');
var fse = require('fs-extra');
var Promise = require('bluebird');
var tempfile = require('tempfile');
var exec = require('child_process').exec;
var execAsync = Promise.promisify(exec);

module.exports = function (frames, config) {
  var outputTemp = tempfile();
  var scaleArg = (config.scale && config.scale < 1) ? `-resize ${parseInt(config.scale * 100, 10)}%` : '';
  var formatArg = '-define png:exclude-chunks=date';
  var trimArg = config.trim ? '-bordercolor transparent -border 1 -trim' : '';

  fse.ensureDirSync(outputTemp);

  return Promise.all(frames.map(function (frame) {
    var outputPath = path.join(outputTemp, `${frame.name}${frame.extension}`);
    return execAsync(`convert ${scaleArg} ${formatArg} "${frame.path}" ${trimArg} "${outputPath}"`)
      .then(function () {
        return Object.assign(frame, {
          path: outputPath
        });
      });
  }));
};
