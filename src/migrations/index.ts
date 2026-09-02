import * as migration_20260830_190000_fgias_animal_keys from './20260830_190000_fgias_animal_keys';
import * as migration_20260830_210000_animal_shows from './20260830_210000_animal_shows';
import * as migration_20260830_230000_weighings from './20260830_230000_weighings';
import * as migration_20260831_090000_dna_isag from './20260831_090000_dna_isag';
import * as migration_20260831_120000_birth_place from './20260831_120000_birth_place';
import * as migration_20260901_090000_gradings_and_calving_event from './20260901_090000_gradings_and_calving_event';
import * as migration_20260901_150000_exterior_scales_and_semen_stock from './20260901_150000_exterior_scales_and_semen_stock';
import * as migration_20260902_120000_origin_identity from './20260902_120000_origin_identity';
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
import * as migration_20260817_090409_membership_review from './20260817_090409_membership_review';
import * as migration_20260817_091349_document_issuance from './20260817_091349_document_issuance';
import * as migration_20260817_133000_access_grants from './20260817_133000_access_grants';
import * as migration_20260817_150000_request_scopes from './20260817_150000_request_scopes';
import * as migration_20260817_170000_view_journal from './20260817_170000_view_journal';
import * as migration_20260817_180000_document_number from './20260817_180000_document_number';
import * as migration_20260817_190000_document_snapshot from './20260817_190000_document_snapshot';
import * as migration_20260822_090000_check_settings from './20260822_090000_check_settings';
import * as migration_20260823_080000_dna_verdict from './20260823_080000_dna_verdict';
import * as migration_20260823_120000_dismissed_issues from './20260823_120000_dismissed_issues';
import * as migration_20260823_170000_check_thresholds from './20260823_170000_check_thresholds';
import * as migration_20260823_200000_id_format_rus from './20260823_200000_id_format_rus';
import * as migration_20260823_230000_verification_withdrawn from './20260823_230000_verification_withdrawn'
import * as migration_20260824_090000_archive_retention from './20260824_090000_archive_retention'
import * as migration_20260824_140000_share_links from './20260824_140000_share_links'
import * as migration_20260824_180000_certificate_check from './20260824_180000_certificate_check';
import * as migration_20260825_090000_movements from './20260825_090000_movements'
import * as migration_20260825_140000_team_roles from './20260825_140000_team_roles'
import * as migration_20260825_200000_media_access from './20260825_200000_media_access'
import * as migration_20260826_090000_operations from './20260826_090000_operations'
import * as migration_20260826_140000_saved_searches from './20260826_140000_saved_searches'
import * as migration_20260826_180000_bench_runs from './20260826_180000_bench_runs'
import * as migration_20260827_090000_semen_and_grade from './20260827_090000_semen_and_grade'
import * as migration_20260828_090000_evaluation_source from './20260828_090000_evaluation_source'
import * as migration_20260828_140000_linear_score from './20260828_140000_linear_score'
import * as migration_20260828_180000_calving_roles from './20260828_180000_calving_roles'
import * as migration_20260829_090000_pending_columns from './20260829_090000_pending_columns'
import * as migration_20260827_120000_check_runs from './20260827_120000_check_runs';
import * as migration_20260830_090000_lab_name from './20260830_090000_lab_name'
import * as migration_20260830_120000_age_group_source from './20260830_120000_age_group_source'
import * as migration_20260830_150000_submission_value_issues from './20260830_150000_submission_value_issues'
import * as migration_20260830_170000_fgias_uuid from './20260830_170000_fgias_uuid';

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
    name: '20260817_074414_verification_requests',
  },
  {
    up: migration_20260817_090409_membership_review.up,
    down: migration_20260817_090409_membership_review.down,
    name: '20260817_090409_membership_review',
  },
  {
    up: migration_20260817_091349_document_issuance.up,
    down: migration_20260817_091349_document_issuance.down,
    name: '20260817_091349_document_issuance'
  },
  {
    up: migration_20260817_133000_access_grants.up,
    down: migration_20260817_133000_access_grants.down,
    name: '20260817_133000_access_grants',
  },
  {
    up: migration_20260817_150000_request_scopes.up,
    down: migration_20260817_150000_request_scopes.down,
    name: '20260817_150000_request_scopes',
  },
  {
    up: migration_20260817_170000_view_journal.up,
    down: migration_20260817_170000_view_journal.down,
    name: '20260817_170000_view_journal',
  },
  {
    up: migration_20260817_180000_document_number.up,
    down: migration_20260817_180000_document_number.down,
    name: '20260817_180000_document_number',
  },
  {
    up: migration_20260817_190000_document_snapshot.up,
    down: migration_20260817_190000_document_snapshot.down,
    name: '20260817_190000_document_snapshot',
  },
  {
    up: migration_20260822_090000_check_settings.up,
    down: migration_20260822_090000_check_settings.down,
    name: '20260822_090000_check_settings',
  },
  {
    up: migration_20260823_080000_dna_verdict.up,
    down: migration_20260823_080000_dna_verdict.down,
    name: '20260823_080000_dna_verdict',
  },
  {
    up: migration_20260823_120000_dismissed_issues.up,
    down: migration_20260823_120000_dismissed_issues.down,
    name: '20260823_120000_dismissed_issues',
  },
  {
    up: migration_20260823_170000_check_thresholds.up,
    down: migration_20260823_170000_check_thresholds.down,
    name: '20260823_170000_check_thresholds',
  },
  {
    up: migration_20260823_200000_id_format_rus.up,
    down: migration_20260823_200000_id_format_rus.down,
    name: '20260823_200000_id_format_rus',
  },
  {
    up: migration_20260823_230000_verification_withdrawn.up,
    down: migration_20260823_230000_verification_withdrawn.down,
    name: '20260823_230000_verification_withdrawn',
  },
  {
    up: migration_20260824_090000_archive_retention.up,
    down: migration_20260824_090000_archive_retention.down,
    name: '20260824_090000_archive_retention',
  },
  {
    up: migration_20260824_140000_share_links.up,
    down: migration_20260824_140000_share_links.down,
    name: '20260824_140000_share_links',
  },
  {
    up: migration_20260824_180000_certificate_check.up,
    down: migration_20260824_180000_certificate_check.down,
    name: '20260824_180000_certificate_check',
  },
  {
    up: migration_20260825_090000_movements.up,
    down: migration_20260825_090000_movements.down,
    name: '20260825_090000_movements',
  },
  {
    up: migration_20260825_140000_team_roles.up,
    down: migration_20260825_140000_team_roles.down,
    name: '20260825_140000_team_roles',
  },
  {
    up: migration_20260825_200000_media_access.up,
    down: migration_20260825_200000_media_access.down,
    name: '20260825_200000_media_access',
  },
  {
    up: migration_20260826_090000_operations.up,
    down: migration_20260826_090000_operations.down,
    name: '20260826_090000_operations',
  },
  {
    up: migration_20260826_140000_saved_searches.up,
    down: migration_20260826_140000_saved_searches.down,
    name: '20260826_140000_saved_searches',
  },
  {
    up: migration_20260826_180000_bench_runs.up,
    down: migration_20260826_180000_bench_runs.down,
    name: '20260826_180000_bench_runs',
  },
  {
    up: migration_20260827_090000_semen_and_grade.up,
    down: migration_20260827_090000_semen_and_grade.down,
    name: '20260827_090000_semen_and_grade',
  },
  {
    up: migration_20260828_090000_evaluation_source.up,
    down: migration_20260828_090000_evaluation_source.down,
    name: '20260828_090000_evaluation_source',
  },
  {
    up: migration_20260828_140000_linear_score.up,
    down: migration_20260828_140000_linear_score.down,
    name: '20260828_140000_linear_score',
  },
  {
    up: migration_20260828_180000_calving_roles.up,
    down: migration_20260828_180000_calving_roles.down,
    name: '20260828_180000_calving_roles',
  },
  {
    up: migration_20260829_090000_pending_columns.up,
    down: migration_20260829_090000_pending_columns.down,
    name: '20260829_090000_pending_columns',
  },
  {
    up: migration_20260827_120000_check_runs.up,
    down: migration_20260827_120000_check_runs.down,
    name: '20260827_120000_check_runs',
  },
  {
    up: migration_20260830_090000_lab_name.up,
    down: migration_20260830_090000_lab_name.down,
    name: '20260830_090000_lab_name',
  },
  {
    up: migration_20260830_120000_age_group_source.up,
    down: migration_20260830_120000_age_group_source.down,
    name: '20260830_120000_age_group_source',
  },
  {
    up: migration_20260830_150000_submission_value_issues.up,
    down: migration_20260830_150000_submission_value_issues.down,
    name: '20260830_150000_submission_value_issues',
  },
  {
    up: migration_20260830_170000_fgias_uuid.up,
    down: migration_20260830_170000_fgias_uuid.down,
    name: '20260830_170000_fgias_uuid',
  },
  {
    up: migration_20260830_190000_fgias_animal_keys.up,
    down: migration_20260830_190000_fgias_animal_keys.down,
    name: '20260830_190000_fgias_animal_keys',
  },
  {
    up: migration_20260830_210000_animal_shows.up,
    down: migration_20260830_210000_animal_shows.down,
    name: '20260830_210000_animal_shows',
  },
  {
    up: migration_20260830_230000_weighings.up,
    down: migration_20260830_230000_weighings.down,
    name: '20260830_230000_weighings',
  },
  {
    up: migration_20260831_090000_dna_isag.up,
    down: migration_20260831_090000_dna_isag.down,
    name: '20260831_090000_dna_isag',
  },
  {
    up: migration_20260831_120000_birth_place.up,
    down: migration_20260831_120000_birth_place.down,
    name: '20260831_120000_birth_place',
  },
  {
    up: migration_20260901_090000_gradings_and_calving_event.up,
    down: migration_20260901_090000_gradings_and_calving_event.down,
    name: '20260901_090000_gradings_and_calving_event',
  },
  {
    up: migration_20260901_150000_exterior_scales_and_semen_stock.up,
    down: migration_20260901_150000_exterior_scales_and_semen_stock.down,
    name: '20260901_150000_exterior_scales_and_semen_stock',
  },
  {
    up: migration_20260902_120000_origin_identity.up,
    down: migration_20260902_120000_origin_identity.down,
    name: '20260902_120000_origin_identity',
  },
];
