import * as migration_20260814_195548 from './20260814_195548';
import * as migration_20260815_061539 from './20260815_061539';
import * as migration_20260815_075706 from './20260815_075706';
import * as migration_20260815_112204_access_requests from './20260815_112204_access_requests';
import * as migration_20260816_071534_index_profiles from './20260816_071534_index_profiles';
import * as migration_20260816_081002_index_values from './20260816_081002_index_values';
import * as migration_20260816_084421_index_bases from './20260816_084421_index_bases';
import * as migration_20260816_091110_index_base_sd from './20260816_091110_index_base_sd';
import * as migration_20260816_105109_submission_animals from './20260816_105109_submission_animals';
import * as migration_20260816_110132_submission_issues from './20260816_110132_submission_issues';
import * as migration_20260816_165734_domain_rules from './20260816_165734_domain_rules';
import * as migration_20260816_172319_evaluation_history from './20260816_172319_evaluation_history';
import * as migration_20260816_180908_index_value_scope from './20260816_180908_index_value_scope';
import * as migration_20260816_182450_index_value_state from './20260816_182450_index_value_state';
import * as migration_20260816_183242_index_value_page from './20260816_183242_index_value_page';
import * as migration_20260816_202140_index_cleanup from './20260816_202140_index_cleanup';
import * as migration_20260816_202627_index_value_cohort from './20260816_202627_index_value_cohort';
import * as migration_20260816_204622_index_value_percentile from './20260816_204622_index_value_percentile';
import * as migration_20260816_211410_index_value_types from './20260816_211410_index_value_types';
import * as migration_20260817_051437_animal_revisions from './20260817_051437_animal_revisions';
import * as migration_20260817_060327_expert_role_and_findings from './20260817_060327_expert_role_and_findings';
import * as migration_20260817_074414_verification_requests from './20260817_074414_verification_requests';

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
    name: '20260816_091110_index_base_sd',
  },
  {
    up: migration_20260816_105109_submission_animals.up,
    down: migration_20260816_105109_submission_animals.down,
    name: '20260816_105109_submission_animals',
  },
  {
    up: migration_20260816_110132_submission_issues.up,
    down: migration_20260816_110132_submission_issues.down,
    name: '20260816_110132_submission_issues',
  },
  {
    up: migration_20260816_165734_domain_rules.up,
    down: migration_20260816_165734_domain_rules.down,
    name: '20260816_165734_domain_rules',
  },
  {
    up: migration_20260816_172319_evaluation_history.up,
    down: migration_20260816_172319_evaluation_history.down,
    name: '20260816_172319_evaluation_history',
  },
  {
    up: migration_20260816_180908_index_value_scope.up,
    down: migration_20260816_180908_index_value_scope.down,
    name: '20260816_180908_index_value_scope',
  },
  {
    up: migration_20260816_182450_index_value_state.up,
    down: migration_20260816_182450_index_value_state.down,
    name: '20260816_182450_index_value_state',
  },
  {
    up: migration_20260816_183242_index_value_page.up,
    down: migration_20260816_183242_index_value_page.down,
    name: '20260816_183242_index_value_page',
  },
  {
    up: migration_20260816_202140_index_cleanup.up,
    down: migration_20260816_202140_index_cleanup.down,
    name: '20260816_202140_index_cleanup',
  },
  {
    up: migration_20260816_202627_index_value_cohort.up,
    down: migration_20260816_202627_index_value_cohort.down,
    name: '20260816_202627_index_value_cohort',
  },
  {
    up: migration_20260816_204622_index_value_percentile.up,
    down: migration_20260816_204622_index_value_percentile.down,
    name: '20260816_204622_index_value_percentile',
  },
  {
    up: migration_20260816_211410_index_value_types.up,
    down: migration_20260816_211410_index_value_types.down,
    name: '20260816_211410_index_value_types',
  },
  {
    up: migration_20260817_051437_animal_revisions.up,
    down: migration_20260817_051437_animal_revisions.down,
    name: '20260817_051437_animal_revisions',
  },
  {
    up: migration_20260817_060327_expert_role_and_findings.up,
    down: migration_20260817_060327_expert_role_and_findings.down,
    name: '20260817_060327_expert_role_and_findings',
  },
  {
    up: migration_20260817_074414_verification_requests.up,
    down: migration_20260817_074414_verification_requests.down,
    name: '20260817_074414_verification_requests'
  },
];
