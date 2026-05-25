import Dysmsapi from '@alicloud/dysmsapi20170525';
import * as AliyunOpenAPI from '@alicloud/openapi-client';
const config = new AliyunOpenAPI.Config({ accessKeyId: 'test', accessKeySecret: 'test', endpoint: 'dysmsapi.aliyuncs.com' });

try {
  console.log('Dysmsapi type:', typeof Dysmsapi);
  console.log('Dysmsapi.default type:', typeof (Dysmsapi as any).default);
  const client = new Dysmsapi(config);
  console.log('Success with new Dysmsapi!');
} catch (e: any) {
  console.log('Error with new Dysmsapi:', e.message);
}

try {
  const client = new (Dysmsapi as any).default(config);
  console.log('Success with new Dysmsapi.default!');
} catch (e: any) {
  console.log('Error with new Dysmsapi.default:', e.message);
}
