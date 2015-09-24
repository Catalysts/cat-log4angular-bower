/*!
 The MIT License (MIT)

 Copyright (c) 2014-2015 Catalysts

 Permission is hereby granted, free of charge, to any person obtaining a copy
 of this software and associated documentation files (the "Software"), to deal
 in the Software without restriction, including without limitation the rights
 to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 copies of the Software, and to permit persons to whom the Software is
 furnished to do so, subject to the following conditions:

 The above copyright notice and this permission notice shall be included in all
 copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 SOFTWARE.
 */
(function (window) {
    'use strict';

    function catLog4Angular(angular) {
'use strict';

/*
 * EcmaScript5 compatible logging based on ideas from Diary.js
 * see https://docs.google.com/document/d/1gGUEODxxDjY7azF8InqtN1pRcLo3WhGb8BcoIihyI80/edit#heading=h.w7kphvm7blel
 *
 * More details:
 * https://github.com/angular/diary.js/blob/master/src/diary.js
 * http://log4javascript.org/
 *
 *
 * Appender interface:
 * {
 *  report(level, group, message [, memorySizes]) : function called by the logger, if the configured log level is met
 * }
 */
angular
    .module('cat.service.log', [])
    .constant('ROOT_LOGGER_NAME', 'ROOT')
    .constant('DEFAULT_LEVEL', 'info')
    .constant('LOG_LEVEL_ORDER', {'debug': 1, 'info': 2, 'warn': 3, 'error': 4})
    .constant('CONSOLE_APPENDER', {
        report: function (level, group, message) {
            if (typeof console === 'object') {
                if (message instanceof Error) {
                    console[level](group + ' ' + message.message);
                    console.log(message.stack);
                } else {
                    console[level](group + ' ' + message);
                }
            }
        }
    })
    .provider('catLogService', ['ROOT_LOGGER_NAME', 'DEFAULT_LEVEL', 'LOG_LEVEL_ORDER',
        function (ROOT_LOGGER_NAME, DEFAULT_LEVEL, LOG_LEVEL_ORDER) {
            // available levels: log, debug, info, warn, error
            var providerSelf = this;
            var config = {};
            config[ROOT_LOGGER_NAME] = DEFAULT_LEVEL;
            var dumpMemorySizes = false;

            var appenderList = [];

            var configureLogLevel = function (group, level) {
                if (group === ROOT_LOGGER_NAME && level === undefined) {
                    throw new Error('Cannot undefine the log level of the root logger.');
                }
                config[group] = level;
                return this;
            };

            this.configure = configureLogLevel;
            this.appender = function (appender) {
                appenderList.push(appender);
                return this;
            };
            this.enableMemorySizes = function () {
                dumpMemorySizes = true;
                return this;
            };
            this.disableMemorySizes = function () {
                dumpMemorySizes = false;
                return this;
            };

            this.$get = function () {
                var rootLogger = {
                    parent: undefined,
                    group: ROOT_LOGGER_NAME,
                    resolveLevel: function () {
                        return config[ROOT_LOGGER_NAME];
                    },
                    setLevel: function (newLevel) {
                        configureLogLevel(this.group, newLevel);
                    }
                };
                /*
                 Resolves the log level for the current logger, by travelling up the hierarchy
                 if no log level is defined for the current logger.
                 This method could be memoized.
                 */
                var resolveLevel = function () {
                    if (angular.isDefined(config[this.group])) {
                        // log level is defined, use it
                        return config[this.group];
                    } else if (angular.isDefined(this.parent)) {
                        return this.parent.resolveLevel();
                    } else {
                        throw new Error('Neither log level nor parent set for this logger: "' + this.group + '".');
                    }
                };
                var loggify = function (logger) {
                    angular.forEach(['debug', 'info', 'warn', 'error'], function (level) {
                        var methodLvlNumber = LOG_LEVEL_ORDER[level];
                        var log = function (message) {
                            if (LOG_LEVEL_ORDER[logger.resolveLevel()] <= methodLvlNumber) {
                                angular.forEach(appenderList, function (appender) {
                                    var memorySizes;
                                    if (dumpMemorySizes && window.performance && window.performance.memory) {
                                        memorySizes = window.performance.memory;
                                    }
                                    appender.report(level, logger.group, message, memorySizes);
                                });
                            }
                        };
                        logger[level] = function (message, func) {
                            if (typeof func === 'undefined') {
                                log(message);
                            } else {
                                // performance measurement
                                var start = new Date().getTime();
                                log('BEFORE: ' + message);
                                func();
                                var elapsed = new Date().getTime() - start;
                                log('AFTER: ' + message + ' took ' + elapsed + ' ms');
                            }
                        };
                    });
                };
                loggify(rootLogger);
                return {
                    Logger: function (group, parent) {
                        if (angular.isUndefined(group)) {
                            return rootLogger;
                        }
                        if (angular.isUndefined(parent)) {
                            // use root logger as default parent
                            parent = rootLogger;
                        }
                        // possibility to memoize the logger object
                        var logger = {
                            parent: parent,
                            group: group,
                            resolveLevel: resolveLevel,
                            setLevel: function (newLevel) {
                                configureLogLevel(this.group, newLevel);
                            }
                        };
                        loggify(logger);
                        return logger;
                    },
                    appender: providerSelf.appender
                };
            };
        }])
    .config(['$provide', function ($provide) {
        $provide.decorator('$log', ['$delegate', 'catLogService', 'ROOT_LOGGER_NAME', function ($delegate, catLogService, ROOT_LOGGER_NAME) {
            // instantiate  root logger
            var rootLogger = catLogService.Logger();

            angular.forEach(['debug', 'info', 'warn', 'error'], function (level) {
                $delegate[level] = rootLogger[level];
            });
            $delegate.Logger = catLogService.Logger;
            $delegate.setLevel = rootLogger.setLevel;
            $delegate.group = ROOT_LOGGER_NAME;

            return $delegate;
        }]);
    }]);

'use strict';

/*
 * HTTP Upload Appender for ngLogCustom module
 *
 * Uploads the logs that have a log level >= minLevel to postUrl in the specified interval.
 * No uploads happen if no suitable logs have been produced.
 */
angular
    .module('cat.service.log')
    .constant('HTTP_LOGGER_NAME', 'catHttpLogAppender')
    .provider('catHttpLogAppender', function () {
        var intervalInSeconds = 10;
        var postUrl;
        var minLevel = 'info';
        this.interval = function (_intervalInSeconds) {
            intervalInSeconds = _intervalInSeconds;
            return this;
        };
        this.postUrl = function (_postUrl) {
            postUrl = _postUrl;
            return this;
        };
        this.minUploadLevel = function (_minLevel) {
            minLevel = _minLevel;
            return this;
        };
        this.$get = ['$http', '$interval', '$log', 'HTTP_LOGGER_NAME', 'LOG_LEVEL_ORDER', function ($http, $interval, $log, HTTP_LOGGER_NAME, LOG_LEVEL_ORDER) {
            var logger = $log.Logger(HTTP_LOGGER_NAME);
            if (typeof postUrl === 'undefined') {
                throw new Error('catHttpLogAppenderProvider requires definition of postUrl');
            }
            var logs = [];

            var appender = {
                report: function (level, group, message, memorySizes) {
                    logs.push({
                        level: level,
                        group: group,
                        message: typeof message === 'string' ? message : message.toString(),
                        memorySizes: memorySizes,
                        timestamp: new Date().getTime()
                    });
                },
                flush: function () {
                    var minLevelOrder = LOG_LEVEL_ORDER[minLevel];
                    var logsToSend = [];
                    angular.forEach(logs, function (logEntry) {
                        if (LOG_LEVEL_ORDER[logEntry.level] >= minLevelOrder) {
                            logsToSend.push(logEntry);
                        }
                    });
                    logs.length = 0;
                    if (logsToSend.length > 0) {
                        return $http.post(postUrl, logsToSend)
                            .success(function () {
                                logger.debug('Successfully uploaded logs.');
                            })
                            .error(function (data, status, headers, config, statusText) {
                                logger.debug('Error uploading logs: ' + status + ' ' + statusText);
                            });
                    } else {
                        logger.debug('No logs to upload - skipping upload request.');
                    }
                }
            };
            $interval(appender.flush, intervalInSeconds * 1000, 0, false);
            return appender;
        }];
    });
        return 'cat.service.log';
    }

    if (!!window.require && !!window.define) {
        window.define(['angular'], catLog4Angular);
    } else {
        catLog4Angular(window.angular);
    }
})(window);
//# sourceMappingURL=cat-log4angular.js.map