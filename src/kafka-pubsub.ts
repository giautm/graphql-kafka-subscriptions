import * as Kafka from 'node-rdkafka'
import { PubSubEngine } from 'graphql-subscriptions'
import * as Logger from 'bunyan';
import { createChildLogger } from './child-logger';
import { PubSubAsyncIterator } from './pubsub-async-iterator'

export interface IKafkaOptions {
  topic: string,
  metadataBrokerList?: string,
  host?: string,
  port?: string,
  logger?: Logger,
}

export interface IKafkaTopic {
  readStream: any,
  writeStream: any,
}

const defaultLogger = Logger.createLogger({
  name: 'pubsub',
  stream: process.stdout,
  level: 'info'
})

export class KafkaPubSub implements PubSubEngine {
  protected producer: any
  protected consumer: any
  protected metadataBrokerList: string
  protected subscriptionMap: { [subId: number]: [string, Function] }
  protected channelSubscriptions: { [channel: string]: Array<number> }
  protected logger: Logger

  constructor(options: IKafkaOptions) {
    this.logger = createChildLogger(
      options.logger || defaultLogger, 'KafkaPubSub')
    this.subscriptionMap = {}
    this.channelSubscriptions = {}
    this.metadataBrokerList = options.metadataBrokerList
      || `${options.host}:${options.port}`;
    this.producer = this.createProducer(options.topic)
    this.consumer = this.createConsumer(options.topic)

    this.consumer.on('data', (message) => {
      this.logger.info('Got message')
      this.onMessage(JSON.parse(message.value.toString()))
    });
  }

  public publish(payload) {
    return this.producer.write(new Buffer(JSON.stringify(payload)))
  }

  public subscribe(channel: string, onMessage: Function, options: Object): Promise<number> {
    const index = Object.keys(this.subscriptionMap).length
    this.subscriptionMap[index] = [channel, onMessage]
    this.channelSubscriptions[channel] = [
      ...(this.channelSubscriptions[channel] || []), index
    ]
    return Promise.resolve(index)
  }

  public unsubscribe(index: number) {
    const [channel] = this.subscriptionMap[index]
    this.channelSubscriptions[channel] = this.channelSubscriptions[channel].filter(subId => subId !== index)
  }

  public asyncIterator<T>(triggers: string | string[]): AsyncIterator<T> {
    return new PubSubAsyncIterator<T>(this, triggers);
  }

  private onMessage({channel, ...message}) {
    const subscriptions = this.channelSubscriptions[channel]
    if (!subscriptions) { return } // no subscribers, don't publish msg
    for (const subId of subscriptions) {
      const [cnl, listener] = this.subscriptionMap[subId]
      listener(message)
    }
  }

  private createProducer(topic: string) {
    const producer = Kafka.Producer.createWriteStream({
      'metadata.broker.list': this.metadataBrokerList
    }, {}, {topic})
    producer.on('error', (err) => {
      this.logger.error(err, 'Error in our kafka stream')
    })
    return producer
  }

  private createConsumer(topic: string) {
    // Create a group for each instance. The consumer will receive all messages from the topic
    const randomGroupId = Math.ceil(Math.random() * 9999)
    const consumer = Kafka.KafkaConsumer.createReadStream({
      'group.id': `kafka-group-${randomGroupId}`,
      'metadata.broker.list': this.metadataBrokerList
    }, {}, {
      topics: [topic]
    });
    return consumer
  }
}
