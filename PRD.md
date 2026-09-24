EQIndex — Horse Intelligence Platform

Product Requirements Document (PRD)

Version: 1.1
Status: MVP Planning

1. Product Overview

1.1 Product Vision

EQIndex is a horse intelligence platform that combines public competition data with user-managed horse information to provide evidence-based insights for equestrian communities.

The platform connects:

Competition performance data

Horse profiles

Rider performance

Event analytics

Stable management data

Training history

The goal is to transform fragmented equestrian data into useful intelligence for both public users and professional users.

2. Problem Statement

Equestrian data is currently fragmented across multiple sources.

Competition results provide performance information, while stable management systems store horse-related information such as training and care records.

The lack of connection between these datasets makes it difficult to:

Understand horse development over time

Analyse rider and horse partnerships

Compare performance across events

Make evidence-based decisions

EQIndex aims to create a connected intelligence platform.

3. Product Goals

3.1 Unified Horse Intelligence Data Model

Create a platform connecting:

Horses

Riders

Trainers

Events

Competition results

Training records

Stable information

3.2 Performance Analytics

Provide insights including:

Horse performance trends

Rider performance

Horse-rider combinations

Event difficulty analysis

Rankings

Benchmarking

3.3 Accessible Intelligence

Make equestrian analytics available to:

Public users exploring data

Professionals managing horses and performance

4. Target Users

4.1 Public Users / Equine Enthusiasts

Description

Users who want to explore equestrian performance information without managing horses directly.

Needs

Explore horse rankings

View rider rankings

Compare horses

Analyse events

Discover performance trends

Features

Public dashboard

Horse profiles

Rider profiles

Rankings

Basic comparisons

Event analytics

4.2 Riders

Description

Riders tracking their own performance and horse partnerships.

Needs

Track competition results

Monitor improvement

Analyse horse combinations

Features

Personal performance dashboard

Rider analytics

Horse partnership insights

Competition history

4.3 Trainers

Description

Professionals managing multiple horses and riders.

Needs

Monitor horse development

Analyse training impact

Compare horses

Features

Stable dashboard

Horse management

Training records

Performance analytics

4.4 Owners

Description

Horse owners monitoring their horse's progress.

Needs

Understand performance

Review history

Track development

Features

Horse profile

Performance timeline

Competition insights

4.5 Breeders

Description

Users interested in pedigree and long-term performance.

Needs

Analyse bloodlines

Review performance history

Features

Pedigree information

Historical performance

Breeding insights

5. User Roles

System roles:

PUBLIC
RIDER
TRAINER
OWNER
BREEDER
ADMIN

Access levels:

Public

Can:

View rankings

Explore profiles

View analytics

Registered Users

Can:

Manage personal data

Add horse information

Access personalised insights

Professional Users

Can:

Manage multiple horses

Access advanced analytics

Generate reports

6. MVP Scope

The first version focuses on:

Horse profiles

Rider profiles

Event and competition data

Performance analytics

Public dashboard

Basic stable data input

Horse-rider relationship analytics

7. Core Features

7.1 Horse Management

Horse profile:

Name

Age

Breed

Gender

Sire

Dam

Breeder

Owner

7.2 Rider Management

Rider profile:

Name

Region

Experience

Competition history

7.3 Competition Data Collection

Data collected from public competition sources.

Event

Event name

Date

Venue

Region

Arena type

Season

Class

Height category

Competition level

Field size

Round Result

Horse

Rider

Event

Faults

Time faults

Total faults

Placing

Clear round status

7.4 Stable Data Input

Users can store:

Training Records

Date

Training type

Intensity

Notes

Rider

Health Records

Vet records

Treatments

Farrier

Vaccination

7.5 Performance Analytics

Horse Metrics

Clear round percentage

Average faults

Consistency score

Performance trend

Rider Metrics

Clear round percentage

Competition results

Horse partnership performance

7.6 Horse-Rider Partnership Analytics

Analyse:

Number of rounds together

Clear round percentage

Average faults

Event performance

7.7 Dashboard

Public Dashboard

Shows:

Top horses

Top riders

Event analytics

Performance trends

Rankings

Professional Dashboard

Shows:

Managed horses

Training progress

Advanced analytics

Reports

7.8 Comparison

Users can compare:

Horse vs Horse

Rider vs Rider

Horse + Rider combination

Metrics:

Performance

Consistency

Competition history

Trends

8. System Architecture

Public Competition Data
          |
          v
Data Collection Pipeline
          |
          v
Data Cleaning & Validation
          |
          v
PostgreSQL Database
          |
          v
Analytics Engine
          |
          v
Backend API
          |
          v
Web Application
          |
          v
Users

Stable user input connects to the same core data model.

9. Data Model

User

id
name
email
role

Horse

id
name
age
breed
sire
dam
owner_id

Rider

id
name
region

Event

id
name
date
venue
season
arena_type

Round Result

id
horse_id
rider_id
event_id

height
faults
time_faults
total_faults
placing
clear_round

Training Record

id
horse_id
rider_id

date
type
notes

10. Data Pipeline

Public Data Sources

        |
        v

Scraper / API Collector

        |
        v

Raw Data Storage

        |
        v

Cleaning

        |
        v

Validation

        |
        v

Analytics Database

11. Non Functional Requirements

Data Quality

System should:

Validate incoming data

Detect duplicates

Maintain consistent horse/rider identity

Performance

Fast dashboard loading

Efficient analytics queries

Scalability

Support:

More users

More data sources

Additional analytics features

Maintainability

Support:

Modular development

Clear API boundaries

Future expansion

12. Development Roadmap

Phase 1 — Foundation

Database design

Authentication

Core entities

Basic dashboard

Phase 2 — Competition Intelligence

Data collection

Competition results

Rankings

Analytics

Phase 3 — Stable Integration

Training records

Health records

Horse development timeline

Phase 4 — Advanced Intelligence

Benchmarking

Comparison

Predictive analytics

AI insights

13. Future Vision

EQIndex becomes a complete horse intelligence ecosystem:

Stable Management
        +
Competition Analytics
        +
Performance Intelligence
        +
AI Insights
        =
Complete Horse Intelligence Platform

Engineering Principle

Build the platform around the core relationships:

Horse → Rider → Event → Performance

The architecture should support future data sources and features without requiring a complete redesign.