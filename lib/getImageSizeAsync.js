var Promise = require('bluebird');
var exec = require('child_process').exec;
var execAsync = Promise.promisify(exec);

module.exports = function (frames, config) {
  var filePaths = frames.map(function (file) {
    return `"${file.path}"`;
  });

  return execAsync(`identify ${filePaths.join(' ')}`)
    .then(function (stdout) {
      var infos = stdout.split('\n').filter(function (item) {
        return item;
      });

      infos.forEach(function (info, i) {
        var size = info.match(/([0-9]+)x([0-9]+)/);
        frames[i].width = parseInt(size[1], 10) + config.padding * 2;
        frames[i].height = parseInt(size[2], 10) + config.padding * 2;

        var forceTrimmed = false;

        if (config.divisibleByTwo) {
          if (frames[i].width & 1) {
            frames[i].width += 1;
            forceTrimmed = true;
          }

          if (frames[i].height & 1) {
            frames[i].height += 1;
            forceTrimmed = true;
          }
        }

        frames[i].area = frames[i].width * frames[i].height;
        frames[i].trimmed = false;

        if (config.trim) {
          var rect = info.match(/([0-9]+)x([0-9]+)[+-]([0-9]+)[+-]([0-9]+)/);
          frames[i].trim = {
            x: parseInt(rect[3], 10) - 1,
            y: parseInt(rect[4], 10) - 1,
            width: parseInt(rect[1], 10) - 2,
            height: parseInt(rect[2], 10) - 2
          };

          var widthTrimmed = frames[i].trim.width !== frames[i].width - config.padding * 2;
          var heightTrimmed = frames[i].trim.height !== frames[i].height - config.padding * 2;
          frames[i].trimmed = forceTrimmed || widthTrimmed || heightTrimmed;
        }
      });

      return frames;
    });
};
