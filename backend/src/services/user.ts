import { EventEmitter } from 'events';

class UserService extends EventEmitter {}

export const userService = new UserService();
