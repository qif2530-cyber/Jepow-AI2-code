import Dysmsapi from '@alicloud/dysmsapi20170525';
import * as starDysmsapi from '@alicloud/dysmsapi20170525';

console.log("imported default:", Dysmsapi);
console.log("typeof Dysmsapi:", typeof Dysmsapi);
if (typeof Dysmsapi === 'function') {
  console.log("Dysmsapi is a function (constructor)");
} else if (Dysmsapi && (Dysmsapi as any).default && typeof (Dysmsapi as any).default === 'function') {
  console.log("Dysmsapi.default is a function (constructor)");
}

console.log("starDysmsapi:", starDysmsapi);
