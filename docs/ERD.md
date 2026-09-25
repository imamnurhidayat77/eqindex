# EQIndex — Entity Relationship Diagram

> Generated from live DB foreign keys. PK = key, * = required.

```mermaid
erDiagram
    admin_activity {
        uuid id PK
        text actor *
        text action *
        text detail
        timestamptz created_at *
    }
    admin_settings {
        text key PK
        text value *
        timestamptz updated_at *
    }
    alert_prefs {
        uuid user_id PK
        bool score_changes *
        bool ranking_movements *
        bool new_results *
        bool benchmark_changes *
        timestamptz updated_at *
    }
    breeder_aliases {
        uuid id PK
        text canonical_name *
        text alias *
        text normalized_alias *
        timestamptz created_at *
    }
    classes {
        uuid id PK
        uuid event_id *
        text name *
        date class_date
        int height_cm
        text level
        int field_size *
        text source *
        text external_class_id
        timestamptz created_at *
        timestamptz updated_at *
        text class_type *
        text course_designer
        time without time zone start_time
        int class_number
        text format
        text sponsor
        text series_key
        text result_status *
        text arena_type
        text surface
        text arena_dimensions
        text warmup_surface
        text surface_condition
        text slope
        text day_night
        text lighting
    }
    coach_athletes {
        uuid coach_user_id PK
        uuid rider_id PK
        timestamptz created_at *
    }
    correction_reports {
        uuid id PK
        text name *
        text email *
        text subject *
        text entity_type
        text entity_id
        text message *
        text status *
        text resolved_note
        timestamptz created_at *
    }
    entity_audit {
        uuid id PK
        text actor *
        text action *
        text entity_type *
        text entity_id
        jsonb detail *
        timestamptz created_at *
    }
    events {
        uuid id PK
        text name *
        date date_start *
        date date_end *
        text venue *
        text venue_country
        text region
        text arena_type
        text season *
        text source *
        text external_show_id
        text external_event_id
        timestamptz created_at *
        timestamptz updated_at *
        text slug
        text event_type
        text status *
        text description
        text image_url
    }
    health_records {
        uuid id PK
        uuid horse_id *
        date date *
        text category *
        text description *
        text provider
        uuid created_by
        timestamptz created_at *
    }
    horse_aliases {
        uuid id PK
        uuid horse_id *
        text alias *
        text normalized_alias *
        text source *
        timestamptz created_at *
    }
    horses {
        uuid id PK
        text name *
        text normalized_name *
        int age
        text breed
        text gender
        text sire
        text dam
        text breeder
        uuid owner_id
        text fei_id
        timestamptz created_at *
        timestamptz updated_at *
        text slug
        text damsire
        int year_of_birth
        text color
        text height
        text country
        text image_url
    }
    import_logs {
        uuid id PK
        text actor *
        text source *
        text filename
        uuid event_id
        int rows_total *
        int rows_ok *
        int rows_failed *
        timestamptz created_at *
    }
    raw_results {
        uuid id PK
        text source *
        text external_show_id
        text external_class_id
        text source_result_id
        jsonb payload *
        text status *
        text error
        timestamptz imported_at *
    }
    review_queue {
        uuid id PK
        text kind *
        text raw_name *
        text normalized_name *
        uuid suggested_match_id
        text suggested_match_name
        text source *
        text status *
        uuid resolved_id
        timestamptz created_at *
    }
    rider_aliases {
        uuid id PK
        uuid rider_id *
        text alias *
        text normalized_alias *
        text source *
        timestamptz created_at *
    }
    rider_claims {
        uuid id PK
        uuid rider_id *
        uuid user_id *
        text status *
        text note
        timestamptz created_at *
    }
    riders {
        uuid id PK
        text name *
        text normalized_name *
        text region
        text fei_id
        timestamptz created_at *
        timestamptz updated_at *
        text slug
        text series_category
        text first_name
        text last_name
        text nationality
        text image_url
        text bio
        text full_name
        uuid user_id
        text claim_status *
    }
    round_results {
        uuid id PK
        uuid event_id *
        uuid class_id *
        uuid horse_id *
        uuid rider_id *
        decimal jump_faults *
        decimal time_faults *
        decimal total_faults *
        decimal time_seconds
        int finish_place
        bool clear_round *
        int height_cm
        text source *
        text source_result_id
        uuid raw_result_id
        timestamptz created_at *
        int points *
        text status *
        text notes
        timestamptz updated_at *
        decimal round2_faults
        decimal round2_time_seconds
        decimal jumpoff_faults
        decimal jumpoff_time_seconds
        decimal prize_money
    }
    saved_comparisons {
        uuid id PK
        uuid user_id *
        text type *
        text a_id *
        text b_id *
        text label
        timestamptz created_at *
    }
    series_info {
        text series_key PK
        text display_name
        text description
        text qual_rules
        bool is_official *
        text official_source
        timestamptz updated_at *
    }
    series_standings {
        uuid id PK
        text series_key *
        text series_name *
        text event_name *
        text season
        text rider_name *
        text horse_name *
        text normalized_rider *
        text normalized_horse *
        decimal total_points *
        jsonb points *
        text source *
        text source_result_id
        timestamptz imported_at *
    }
    sessions {
        uuid id PK
        uuid user_id *
        text token_hash *
        text user_agent
        text ip
        timestamptz expires_at *
        timestamptz created_at *
    }
    training_records {
        uuid id PK
        uuid horse_id *
        uuid rider_id
        date date *
        text type *
        text intensity
        text notes
        uuid created_by
        timestamptz created_at *
    }
    users {
        uuid id PK
        text name *
        text email *
        text role *
        timestamptz created_at *
        timestamptz updated_at *
        text password_hash
        timestamptz email_verified_at
    }
    watchlist_items {
        uuid id PK
        uuid user_id *
        text entity_type *
        uuid entity_id
        text note
        timestamptz created_at *
        uuid horse_id
        uuid rider_id
        bool is_public *
    }
    weather_cache {
        text venue_norm PK
        date date PK
        decimal temp_c
        decimal rainfall_mm
        decimal wind_kph
        int wind_dir_deg
        int humidity_pct
        text classification
        text source *
        decimal lat
        decimal lon
        bool is_estimate *
        timestamptz fetched_at *
    }
    alert_prefs }o--|| users : "user_id"
    classes }o--|| events : "event_id"
    coach_athletes }o--|| riders : "rider_id"
    coach_athletes }o--|| users : "coach_user_id"
    health_records }o--|| horses : "horse_id"
    health_records }o--|| users : "created_by"
    horse_aliases }o--|| horses : "horse_id"
    horses }o--|| users : "owner_id"
    import_logs }o--|| events : "event_id"
    rider_aliases }o--|| riders : "rider_id"
    rider_claims }o--|| riders : "rider_id"
    rider_claims }o--|| users : "user_id"
    riders }o--|| users : "user_id"
    round_results }o--|| horses : "horse_id"
    round_results }o--|| riders : "rider_id"
    round_results }o--|| raw_results : "raw_result_id"
    round_results }o--|| classes : "class_id"
    round_results }o--|| events : "event_id"
    saved_comparisons }o--|| users : "user_id"
    sessions }o--|| users : "user_id"
    training_records }o--|| users : "created_by"
    training_records }o--|| horses : "horse_id"
    training_records }o--|| riders : "rider_id"
    watchlist_items }o--|| riders : "rider_id"
    watchlist_items }o--|| horses : "horse_id"
    watchlist_items }o--|| users : "user_id"
```

## Views (read-only, dihitung dari tabel fakta)

| View | Sumber |
|---|---|
| `horse_stats` | horses + round_results + classes |
| `rider_stats` | riders + round_results + classes |
| `horse_point_stats` | horses + round_results + classes (poin briefing, 12m/3m) |
| `rider_point_stats` | riders + round_results + classes (poin briefing, 12m/3m) |
| `partnership_stats` | horse × rider pairs |
| `class_stats` | classes + events + round_results |
| `horse_height_stats` | per-horse height progression |
| `horse_recent_form` | last 5 starts |
| `series_rankings` | series_standings + RANK() window |

## Triggers & functions

| Objek | Peran |
|---|---|
| `round_results_score()` + trg | isi `points` otomatis (briefing §5), 0 bila Elim/WD/DQ |
| `brief_points(place, class_type)` | 12/9/7/… × multiplier GP 2.0 / Premier 1.5 / … |
| `set_updated_at()` | sentuh `updated_at` tiap UPDATE |
| `eq_slug(name)` | slug URL dari nama |
