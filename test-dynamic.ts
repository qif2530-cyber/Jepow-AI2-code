const pkg = require('@alicloud/dysmsapi20170525');
console.log(Object.keys(pkg));
if (pkg.default) {
  console.log('yes default', typeof pkg.default);
  try {
    new pkg.default({});
    console.log('pkg.default works');
  } catch(e: any) {
    console.log('pkg.default err', e.message);
  }
} else {
  console.log('no default');
  try {
    new pkg({});
    console.log('pkg works');
  } catch(e: any) {
    console.log('pkg err', e.message);
  }
}
