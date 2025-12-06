
import { authenticator } from 'otplib';

const secret = authenticator.generateSecret(32);
console.log('Secret:', secret);

const token = authenticator.generate(secret);
console.log('Token:', token);

const isValid = authenticator.verify({ token, secret });
console.log('Is Valid:', isValid);

const otpauth = authenticator.keyuri('testuser', 'ft_transcendence', secret);
console.log('OTP Auth URL:', otpauth);
