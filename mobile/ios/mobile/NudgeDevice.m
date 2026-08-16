#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(NudgeDevice, NSObject)

RCT_EXTERN__BLOCKING_SYNCHRONOUS_METHOD(saveSecret:(NSString *)key value:(NSString *)value)
RCT_EXTERN__BLOCKING_SYNCHRONOUS_METHOD(loadSecret:(NSString *)key)
RCT_EXTERN__BLOCKING_SYNCHRONOUS_METHOD(deleteSecret:(NSString *)key)
RCT_EXTERN__BLOCKING_SYNCHRONOUS_METHOD(randomBytesHex:(nonnull NSNumber *)size)
RCT_EXTERN__BLOCKING_SYNCHRONOUS_METHOD(deriveKeyHex:(NSString *)token)
RCT_EXTERN__BLOCKING_SYNCHRONOUS_METHOD(encryptAesGcm:(NSString *)keyHex plaintext:(NSString *)plaintext seq:(nonnull NSNumber *)seq)
RCT_EXTERN__BLOCKING_SYNCHRONOUS_METHOD(decryptAesGcm:(NSString *)keyHex ivBase64:(NSString *)ivBase64 dataBase64:(NSString *)dataBase64 tagBase64:(NSString *)tagBase64 seq:(nonnull NSNumber *)seq)

@end
