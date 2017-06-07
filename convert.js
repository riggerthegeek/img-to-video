/**
 * convert
 */

/* Node modules */
const fs = require('fs');

/* Third-party modules */
const Dropbox = require('dropbox');
const mkdirp = require('mkdirp');
const videoshow = require('videoshow');
const yargs = require('yargs');

/* Files */

const argv = yargs.argv;

const startTime = Date.now();

const config = {
  dropboxKey: argv.dropboxKey,
  dropboxPath: argv.dropboxPath,
  savePath: argv.savePath,
  videoName: argv.videoName,
};

for (const key in config) {
  if (!config[key]) {
    throw new Error(`Config value not set: ${key}`);
  }
}

const dbx = new Dropbox({
  accessToken: config.dropboxKey
});

/* Create the store directory */
const storeDirectory = `/opt/img/${config.dropboxPath}`;
const targetDirectory = `/opt/video`;

mkdirp.sync(storeDirectory);
mkdirp.sync(targetDirectory);

const videoName = `${config.videoName}.mp4`;
const videoPath = `${targetDirectory}/${videoName}`;
const dropboxVideoPath = `${config.savePath}/${videoName}`;

const getFiles = ({ path = undefined, cursor = undefined }) => {
  let promise;
  if (path) {
    /* Initial get */
    console.log(`Getting files: ${path}`);
    promise = dbx.filesListFolder({
      path,
      recursive: false,
      include_media_info: false,
      include_deleted: false,
      include_has_explicit_shared_members: false
    })
  } else if (cursor) {
    /* Continuation */
    promise = {};
    throw new Error('@todo');
  } else {
    throw new Error('Path or cursor must be set to get files');
  }

  return promise.then(({ entries, cursor, has_more }) => {
    if (has_more) {
      return getFiles({ cursor })
        .then(files => entries.concat(files));
    } else {
      return entries;
    }
  });
};

getFiles({ path: config.dropboxPath })
  .then(entries => {
    const files = [];

    return entries.reduce((thenable, entry) => {
      const localPath = `${storeDirectory}/${entry.name}`;

      files.push({
        entry,
        localPath
      });

      return thenable
        .then(() => {
          /* See if file exists */
          fs.readFileSync(localPath);

          console.log(`File already downloaded: ${entry.name}`);

          /* It does - nothing to do */
        })
        .catch(() => {
          /* Nope */
          console.log(`Downloading file: ${entry.name}`);

          return dbx.filesDownload({ path: entry.path_lower })
            .then(file => {
              /* Save the file */
              console.log(`Downloaded file: ${entry.name}`);

              fs.writeFileSync(localPath, file.fileBinary, {
                encoding: 'binary'
              });
            });
        });
    }, Promise.resolve())
      /* Ensure in the correct order */
      .then(() => files.sort((a, b) => {
        const aName = a.entry.name;
        const bName = b.entry.name;

        if (aName < bName) {
          return -1;
        } else if (aName > bName) {
          return 1;
        }

        return 0;
      }));
  })
  .then(files => new Promise((resolve, reject) => {
    /* Generate the video */
    console.log('Generating video');

    const img = files.map(({ localPath }) => localPath);

    const videoOptions = {
      fps: 25,
      loop: 0.2,
      transition: false,
      videoBitrate: 1024,
      videoCodec: 'libx264',
      size: '640x?',
      format: 'mp4',
      pixelFormat: 'yuv420p'
    };

    videoshow(img, videoOptions)
      .save(videoPath)
      .on('start', command => {
        console.log('ffmpeg process started:', command);
      })
      .on('error', (err, stdout, stderr) => {
        console.error('Error:', err);
        console.error('ffmpeg stderr:', stderr);

        reject(err);
      })
      .on('end', output => {
        console.error('Video created in:', output);
        resolve(output);
      });
  }))
  .then(() => {
    /* Upload to Dropbox */
    console.log(`Uploading file to Dropbox: ${dropboxVideoPath}`);

    const contents = fs.readFileSync(videoPath);

    return dbx.filesUpload({
      contents,
      path: dropboxVideoPath,
      mode: {
        '.tag': 'overwrite'
      },
      autorename: false,
      mute: false
    });
  })
  .then(() => {
    const seconds = Math.round((Date.now() - startTime) / 1000);

    console.log(`Completed in ${seconds} seconds`);
  }).catch(err => {
    console.log(err);
    process.exit(1);
  });
