import * as migration_20260814_195548 from './20260814_195548';
import * as migration_20260815_061539 from './20260815_061539';

export const migrations = [
  {
    up: migration_20260814_195548.up,
    down: migration_20260814_195548.down,
    name: '20260814_195548',
  },
  {
    up: migration_20260815_061539.up,
    down: migration_20260815_061539.down,
    name: '20260815_061539'
  },
];
