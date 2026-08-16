import * as migration_20260814_195548 from './20260814_195548';
import * as migration_20260815_061539 from './20260815_061539';
import * as migration_20260815_075706 from './20260815_075706';
import * as migration_20260815_112204_access_requests from './20260815_112204_access_requests';
import * as migration_20260816_071534_index_profiles from './20260816_071534_index_profiles';

export const migrations = [
  {
    up: migration_20260814_195548.up,
    down: migration_20260814_195548.down,
    name: '20260814_195548',
  },
  {
    up: migration_20260815_061539.up,
    down: migration_20260815_061539.down,
    name: '20260815_061539',
  },
  {
    up: migration_20260815_075706.up,
    down: migration_20260815_075706.down,
    name: '20260815_075706',
  },
  {
    up: migration_20260815_112204_access_requests.up,
    down: migration_20260815_112204_access_requests.down,
    name: '20260815_112204_access_requests',
  },
  {
    up: migration_20260816_071534_index_profiles.up,
    down: migration_20260816_071534_index_profiles.down,
    name: '20260816_071534_index_profiles'
  },
];
