import {AI_PROVIDERS, FREE_PROVIDERS} from './src/shared/constants/providers.js';
const p = AI_PROVIDERS['opencode'];
console.log(JSON.stringify({name:p?.name, noAuth:p?.noAuth, category:p?.category, authModes:p?.authModes}));
console.log('in FREE_PROVIDERS:', !!FREE_PROVIDERS['opencode']);
