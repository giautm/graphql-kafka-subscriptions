"use strict";
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) if (e.indexOf(p[i]) < 0)
            t[p[i]] = s[p[i]];
    return t;
};
Object.defineProperty(exports, "__esModule", { value: true });
var Kafka = require("node-rdkafka");
var Logger = require("bunyan");
var child_logger_1 = require("./child-logger");
var pubsub_async_iterator_1 = require("./pubsub-async-iterator");
var defaultLogger = Logger.createLogger({
    name: 'pubsub',
    stream: process.stdout,
    level: 'info'
});
var KafkaPubSub = (function () {
    function KafkaPubSub(options) {
        var _this = this;
        this.logger = child_logger_1.createChildLogger(options.logger || defaultLogger, 'KafkaPubSub');
        this.subscriptionMap = {};
        this.channelSubscriptions = {};
        this.metadataBrokerList = options.metadataBrokerList
            || options.host + ":" + options.port;
        this.producer = this.createProducer(options.topic);
        this.consumer = this.createConsumer(options.topic);
        this.consumer.on('data', function (message) {
            _this.logger.info('Got message');
            _this.onMessage(JSON.parse(message.value.toString()));
        });
    }
    KafkaPubSub.prototype.publish = function (payload) {
        return this.producer.write(new Buffer(JSON.stringify(payload)));
    };
    KafkaPubSub.prototype.subscribe = function (channel, onMessage, options) {
        var index = Object.keys(this.subscriptionMap).length;
        this.subscriptionMap[index] = [channel, onMessage];
        this.channelSubscriptions[channel] = (this.channelSubscriptions[channel] || []).concat([
            index
        ]);
        return Promise.resolve(index);
    };
    KafkaPubSub.prototype.unsubscribe = function (index) {
        var channel = this.subscriptionMap[index][0];
        this.channelSubscriptions[channel] = this.channelSubscriptions[channel].filter(function (subId) { return subId !== index; });
    };
    KafkaPubSub.prototype.asyncIterator = function (triggers) {
        return new pubsub_async_iterator_1.PubSubAsyncIterator(this, triggers);
    };
    KafkaPubSub.prototype.onMessage = function (_a) {
        var channel = _a.channel, message = __rest(_a, ["channel"]);
        var subscriptions = this.channelSubscriptions[channel];
        if (!subscriptions) {
            return;
        }
        for (var _i = 0, subscriptions_1 = subscriptions; _i < subscriptions_1.length; _i++) {
            var subId = subscriptions_1[_i];
            var _b = this.subscriptionMap[subId], cnl = _b[0], listener = _b[1];
            listener(message);
        }
    };
    KafkaPubSub.prototype.createProducer = function (topic) {
        var _this = this;
        var producer = Kafka.Producer.createWriteStream({
            'metadata.broker.list': this.metadataBrokerList
        }, {}, { topic: topic });
        producer.on('error', function (err) {
            _this.logger.error(err, 'Error in our kafka stream');
        });
        return producer;
    };
    KafkaPubSub.prototype.createConsumer = function (topic) {
        var randomGroupId = Math.ceil(Math.random() * 9999);
        var consumer = Kafka.KafkaConsumer.createReadStream({
            'group.id': "kafka-group-" + randomGroupId,
            'metadata.broker.list': this.metadataBrokerList
        }, {}, {
            topics: [topic]
        });
        return consumer;
    };
    return KafkaPubSub;
}());
exports.KafkaPubSub = KafkaPubSub;
//# sourceMappingURL=kafka-pubsub.js.map