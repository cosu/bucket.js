bucket.js
=========

A simple NodeJS file management web server

## Features
* Single asynchronous basic file operations:
       * upload (PUT)
       * download
       * delete

* Single asynchronous file metadata retrieval:
       * inode information
       * SHA256 checksum

* Multiple parallel asynchronous file operations 
       * inode information
       * delete

## TODO:
* Refactor
* Load settings from configuration file
* Multipart POST upload
* SSL streams (with client authentication)
* Zlib on-the-fly compression
