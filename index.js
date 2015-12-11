console.log('Loading function');

var async = require('async');
var AWS = require('aws-sdk');
var gm = require('gm').subClass({
    imageMagick: true
});

// our bucket region
AWS.config.region = 'us-west-2';
// get reference to S3 client 
var s3 = new AWS.S3();

exports.handler = function(event, context) {
    console.log('Received event:', JSON.stringify(event, null, 2));

    if (!event.bucket) {
        context.fail('bucket required');
        return;
    }

    if (!event.filename) {
        context.fail('filename required');
        return;
    }

    if (!event.thumbnail) {
        context.fail('thumbnail required');
        return;
    }

    if (!event.max_width) {
        context.fail('max_width required');
        return;
    }

    if (!event.max_height) {
        context.fail('max_height required');
        return;
    }

    // our bucket
    var bucket = event.bucket;
    // the source image
    var src = 'src/' + event.filename;
    // the destination image
    var dst = 'thumb/' + event.thumbnail;
    // max width
    var max_width = event.max_width;
    // max height
    var max_height = event.max_height;

    // hold our thumb stats
    var thumb_width;
    var thumb_height;

    // Download the image from S3, transform, and upload to a different S3 bucket.
    async.waterfall([
            function download(next) {
                // Download the image from S3 into a buffer.
                s3.getObject({
                    Bucket: bucket,
                    Key: src
                }, next);
            },
            function tranform(response, next) {
                gm(response.Body, 'image[0]')
                    .quality(90)
                    .background("white")
                    .flatten()
                    .resize(max_width, max_height, '>')
                    .toBuffer('JPG', function(err, buffer) {
                        if (err) {
                            next(err);
                        } else {
                            gm(buffer)
                                .size(function(err, size) {
                                    if (err) {
                                        next(err);
                                    } else {
                                        // get our sizes
                                        thumb_height = size.height;
                                        thumb_width = size.width;
                                    }
                                })
                            next(null, response.ContentType, buffer);
                        }
                    });
            },
            function upload(contentType, data, next) {
                // Stream the transformed image to a different S3 bucket.
                s3.putObject({
                    Bucket: bucket,
                    Key: dst,
                    Body: data,
                    ContentType: contentType,
                    ServerSideEncryption: 'AES256'
                }, next);
            }
        ],
        function(err) {
            if (err) {
                context.fail(new Error('Failed due to error: ' + err));
            } else {
                context.succeed({
                    successMessage: 'thumbnail created',
                    thumbWidth: thumb_width,
                    thumbHeight: thumb_height
                });
            }
        }
    );
};
