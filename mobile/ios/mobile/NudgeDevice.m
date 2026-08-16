#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(NudgeDevice, NSObject)

RCT_EXTERN__BLOCKING_SYNCHRONOUS_METHOD(saveSecret:(NSString *)key value:(NSString *)value)
RCT_EXTERN__BLOCKING_SYNCHRONOUS_METHOD(loadSecret:(NSString *)key)
RCT_EXTERN__BLOCKING_SYNCHRONOUS_METHOD(deleteSecret:(NSString *)key)
RCT_EXTERN__BLOCKING_SYNCHRONOUS_METHOD(randomBytesHex:(nonnull NSNumber *)size)

@end
