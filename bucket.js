// Bucket.js
// A simple Node.JS file management webserver

var fs = require('fs'),
    http = require('http'),
    crypto = require('crypto'),
    zlib = require('zlib'),
    path = require('path'),
    util = require('util'),
    querystring = require('querystring'),
    jsonstream = require('JSONStream'),
    async = require('async');

function reportError(err, response) {
    switch (err.code) {
        case 'EINVAL':
            response.writeHead(400, {'Content-Type': 'application/problem+json'});
            response.end(JSON.stringify({'detail': 'Bad Request'}));
            break;
        case 'ENOENT':
        case 'ESRCH':
            response.writeHead(404, {'Content-Type': 'application/problem+json'});
            response.end(JSON.stringify({'detail': 'Not Found'}));
            break;
        case 'EPERM':
        case 'EACCES':
            response.writeHead(401, {'Content-Type': 'application/problem+json'});
            response.end(JSON.stringify({'detail': 'Unauthorized'}));
            break;
        case 'EISDIR':
            response.writeHead(405, {'Content-Type': 'application/problem+json'});
            response.end(JSON.stringify({'detail': 'Is A Directory'}));
            break;
        case 'EIO':
        default:
            response.writeHead(500, {'Content-Type': 'application/problem+json'});
            response.end(JSON.stringify({'detail': 'Internal Server Error'}));
            break;
    }
}

function handleFileDownload(pathname, response) {
    console.log("download('%s')", pathname);

    var readstream = fs.createReadStream(pathname);

    readstream.on('error', function (error) {
        readstream.unpipe(response);
        return reportError(error, response);
    });

    response.writeHead(200, {'Content-Type': 'application/octet-stream'});
    readstream.pipe(response);
}

function handleFileUpload(pathname, request, response) {
    console.log("upload('%s')", pathname);

    var writestream = fs.createWriteStream(pathname);

    writestream.on('open', function () {
        request.pipe(writestream);
        response.writeHead(200);
        response.end();
    });

    writestream.on('error', function (error) {
        request.unpipe(writestream);
        return reportError(error, response);
    });
}

function handleFileMetadata(pathname, response) {
    console.log("metadata('%s')", pathname);

    fs.stat(pathname, function (err, stat) {
        if (err) {
            return reportError(err, response);
        } else {
            response.writeHead(200, {'Content-Type': 'application/json'});
            response.end(JSON.stringify(stat) + '\n');
        }
    });
}

function handleMultipleFileMetadata(request, response) {
    console.log("multiplemetadata()");

    var jsonparser = jsonstream.parse('paths.*');
    var files = [];

    jsonparser.on('data', function(data) {
        files.push(data);
    });

    jsonparser.on('error', function (error) {
        request.unpipe(jsonparser);
        return reportError(error, response);
    });

    jsonparser.on('root', function (object) {
        async.map(files,
                function (file, callback) {
                    fs.stat(file, function (err, stat) {
                        return callback(null, {"path" : file, "err": err, "stat" : stat});
                    });
                },
                function (err, results) {
                    response.writeHead(200);
                    response.end(JSON.stringify(results));
                });
    });

    request.pipe(jsonparser);
}

function handleFileChecksum(pathname, response) {
    console.log("checksum('%s')", pathname);

    var sha256sum = crypto.createHash('sha256');
    var readstream = fs.createReadStream(pathname);
    
    readstream.on('error', function (error) {
        return reportError(error, response);
    });

    readstream.on('data', function (ctx) {
        sha256sum.update(ctx);
    });

    readstream.on('end', function() {
        response.writeHead(200, {'Content-Type': 'application/json'});
        response.end(JSON.stringify({'filename': pathname,
                                     'SHA256': sha256sum.digest('hex')}) + '\n');
    });
}

function handleFileDelete(pathname, response) {
    console.log("delete('%s')", pathname);

    fs.stat(pathname, function (err, stat) {
        if (err) {
            return reportError(err, response);
        }

        fs.unlink(pathname, function(err) {
            if (err) {
                return reportError(err, response);
            } else {
                response.writeHead(200,
                                   {'Content-Type': 'application/json'});
                response.end(JSON.stringify(stat) + '\n');
            }
        });
    });
}

function handleMultipleFileDelete(request, response) {
    console.log("multipledelete()");

    var jsonparser = jsonstream.parse('paths.*');
    var files = [];

    jsonparser.on('data', function(data) {
        files.push(data);
    });

    jsonparser.on('error', function (error) {
        request.unpipe(jsonparser);
        return reportError(error, response);
    });

    jsonparser.on('root', function (object) {
        async.map(files,
                function (file, callback) {
                    fs.stat(file, function (err, stat) {
                        if (err) {
                            return callback(null, {"path" : file, "err": err, "stat" : stat});
                        } else {
                            fs.unlink(file, function (err) {
                                return callback(null, {"path" : file, "err": err, "stat" : stat});
                            });
                        }
                    });
                },
                function (err, results) {
                    response.writeHead(200);
                    response.end(JSON.stringify(results));
                });
    });

    request.pipe(jsonparser);
}

function routeGet(request, response) {
    var wherewhat = request.url.match(/\/([^\/]+)(\/.+)/);

    if (wherewhat) {
        var controller = wherewhat[1];
        var pathname = path.normalize(querystring.unescape(wherewhat[2]));

        switch (controller) {
            case 'files':
                handleFileDownload(pathname, response);
                break;
            case 'metadata':
                handleFileMetadata(pathname, response);
                break;
            case 'checksum':
                handleFileChecksum(pathname, response);
                break;
            default:
                response.writeHead(400,
                                   {'Content-Type': 'application/problem+json'});
                response.end(JSON.stringify({'detail': 'Bad Request'}));
                break;
        }
    } else {
        response.writeHead(400, {'Content-Type': 'application/problem+json'});
        response.end(JSON.stringify({'detail': 'Bad Request'}));
    }
}

function routePut(request, response) {
    var wherewhat = request.url.match(/\/([^\/]+)(\/.+)/);

    if (wherewhat) {
        var controller = wherewhat[1];
        var pathname = querystring.unescape(wherewhat[2]);

        switch (controller) {
            case 'files':
                handleFileUpload(pathname, request, response);
                break;
            default:
                response.writeHead(400,
                                   {'Content-Type': 'application/problem+json'});
                response.end(JSON.stringify({'detail': 'Bad Request'}));
                break;
        }
    } else {
        response.writeHead(400, {'Content-Type': 'application/problem+json'});
        response.end(JSON.stringify({'detail': 'Bad Request'}));
    }
}

function routePost(request, response) {
    var wherewhat = request.url.match(/\/([a-z]+$)/);

    if (wherewhat) {
        var controller = wherewhat[1];

        switch (controller) {
            case 'metadata':
                handleMultipleFileMetadata(request, response);
                break;
            case 'checksum':
                handleMultipleFileChecksum(request, response);
                break;
            case 'delete':
                handleMultipleFileDelete(request, response);
                break;
            default:
                response.writeHead(400,
                                   {'Content-Type': 'application/problem+json'});
                response.end(JSON.stringify({'detail': 'Bad Request'}));
                break;
        }
    } else {
        response.writeHead(400, {'Content-Type': 'application/problem+json'});
        response.end(JSON.stringify({'detail': 'Bad Request'}));
    }
}

function routeDelete(request, response) {
    var wherewhat = request.url.match(/\/([^\/]+)(\/.+)/);

    if (wherewhat) {
        var controller = wherewhat[1];
        var pathname = querystring.unescape(wherewhat[2]);

        switch (controller) {
            case 'files':
                handleFileDelete(pathname, response);
                break;
            default:
                response.writeHead(400,
                                   {'Content-Type': 'application/problem+json'});
                response.end(JSON.stringify({'detail': 'Bad Request'}));
                break;
        }
    } else {
        response.writeHead(400, {'Content-Type': 'application/problem+json'});
        response.end(JSON.stringify({'detail': 'Bad Request'}));
    }
}

function Dispatch(request, response) {
    switch(request.method) {
        case 'GET':
            routeGet(request, response);
            break;
        case 'PUT':
            routePut(request, response);
            break;
        case 'POST':
            routePost(request, response);
            break;
        case 'DELETE':
            routeDelete(request, response);
            break;
        default:
            response.writeHead(500, {'Content-Type': 'application/problem+json'});
            response.end(JSON.stringify({'detail': 'Invalid Method'}));
            break;
    }
}

http.createServer(function (request, response) {
    Dispatch(request, response);
}).listen(4000);

