import Dysmsapi from '@alicloud/dysmsapi20170525';
import OpenApi from '@alicloud/openapi-client';

async function test() {
  console.log('--- Test V2 SDK Structure ---');
  console.log('Dysmsapi type:', typeof Dysmsapi);
  
  try {
    const Mod: any = await import('@alicloud/dysmsapi20170525');
    console.log('Default type:', typeof Mod.default);
    
    const Client = Mod.default || Mod;
    console.log('Resolved Client type:', typeof Client);
    
    const config = new (OpenApi as any).Config({
      accessKeyId: 'test',
      accessKeySecret: 'test',
      endpoint: 'dysmsapi.aliyuncs.com'
    });
    
    const client = new (Client as any)(config);
    console.log('Success instantiating V2 Client');
    console.log('Functions available:', Object.getOwnPropertyNames(Object.getPrototypeOf(client)));
  } catch (err) {
    console.error('Test failed:', err);
  }
}

test();
