import * as migration_20260814_195548 from './20260814_195548';
import * as migration_20260815_061539 from './20260815_061539';
import * as migration_20260815_075706 from './20260815_075706';
import * as migration_20260815_112204_access_requests from './20260815_112204_access_requests';
import * as migration_20260816_071534_index_profiles from './20260816_071534_index_profiles';
import * as migration_20260816_081002_index_values from './20260816_081002_index_values';
import * as migration_20260816_084421_index_bases from './20260816_084421_index_bases';
import * as migration_20260816_091110_index_base_sd from './20260816_091110_index_base_sd';

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
    name: '20260816_071534_index_profiles',
  },
  {
    up: migration_20260816_081002_index_values.up,
    down: migration_20260816_081002_index_values.down,
    name: '20260816_081002_index_values',
  },
  {
    up: migration_20260816_084421_index_bases.up,
    down: migration_20260816_084421_index_bases.down,
    name: '20260816_084421_index_bases',
  },
  {
    up: migration_20260816_091110_index_base_sd.up,
    down: migration_20260816_091110_index_base_sd.down,
    name: '20260816_091110_index_base_sd'
  },
];
