var path = require('path');
var fse = require('fs-extra');
var Promise = require('bluebird');
var exec = require('child_process').exec;
var execAsync = Promise.promisify(exec);

module.exports = function (frames, outputDir, config) {
  var scaleArg = (config.scale && config.scale < 1) ? `-resize ${parseInt(config.scale * 100, 10)}%` : '';
  var formatArg = '-define png:exclude-chunks=date';
  var trimArg = config.trim ? '-bordercolor transparent -border 1 -trim' : '';

  fse.ensureDirSync(outputDir);

  return Promise.all(frames.map(function (frame) {
    var outputPath = path.join(outputDir, `${frame.name}${frame.extension}`);
    return execAsync(`convert ${scaleArg} ${formatArg} "${frame.path}" ${trimArg} "${outputPath}"`)
      .then(function () {
        return Object.assign(frame, {
          path: outputPath
        });
      });
  }));
};
