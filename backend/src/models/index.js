// =============================================================================
// src/models/index.js
// Loads all 19 Sequelize models and defines associations
// This is the single entry point for all model imports in the application.
// =============================================================================

const sequelize = require('../config/database');

// ── Import all models ──────────────────────────────────────────────────────
const Department          = require('./Department');
const User                = require('./User');
const EmployeeProfile     = require('./EmployeeProfile');
const DocumentType        = require('./DocumentType');
const OnboardingDocument  = require('./OnboardingDocument');
const OnboardingTask      = require('./OnboardingTask');
const TaskAssignment      = require('./TaskAssignment');
const EvaluationCriterion = require('./EvaluationCriterion');
const ProbationPeriod     = require('./ProbationPeriod');
const EvaluationCheckpoint = require('./EvaluationCheckpoint');
const ManagerEvaluation   = require('./ManagerEvaluation');
const EvaluationScore     = require('./EvaluationScore');
const SelfAssessment      = require('./SelfAssessment');
const SelfAssessmentScore = require('./SelfAssessmentScore');
const FinalRecommendation = require('./FinalRecommendation');
const PerformanceNote     = require('./PerformanceNote');
const GeneratedReport     = require('./GeneratedReport');
const Notification        = require('./Notification');
const AuditLog            = require('./AuditLog');

// =============================================================================
// ASSOCIATIONS
// =============================================================================

// ── Department ↔ EmployeeProfile ──────────────────────────────────────────
Department.hasMany(EmployeeProfile, {
  foreignKey: 'department_id',
  onDelete: 'SET NULL',
  onUpdate: 'CASCADE',
});
EmployeeProfile.belongsTo(Department, {
  foreignKey: 'department_id',
  as: 'department',
});

// ── User ↔ EmployeeProfile (as employee) ─────────────────────────────────
User.hasOne(EmployeeProfile, {
  foreignKey: 'user_id',
  as: 'employeeProfile',
  onDelete: 'RESTRICT',
  onUpdate: 'CASCADE',
});
EmployeeProfile.belongsTo(User, {
  foreignKey: 'user_id',
  as: 'user',
});

// ── User ↔ EmployeeProfile (as manager) ──────────────────────────────────
User.hasMany(EmployeeProfile, {
  foreignKey: 'manager_id',
  as: 'managedEmployees',
  onDelete: 'SET NULL',
  onUpdate: 'CASCADE',
});
EmployeeProfile.belongsTo(User, {
  foreignKey: 'manager_id',
  as: 'manager',
});

// ── DocumentType ↔ OnboardingDocument ────────────────────────────────────
DocumentType.hasMany(OnboardingDocument, {
  foreignKey: 'document_type_id',
  onDelete: 'RESTRICT',
  onUpdate: 'CASCADE',
});
OnboardingDocument.belongsTo(DocumentType, {
  foreignKey: 'document_type_id',
  as: 'documentType',
});

// ── EmployeeProfile ↔ OnboardingDocument ─────────────────────────────────
EmployeeProfile.hasMany(OnboardingDocument, {
  foreignKey: 'profile_id',
  as: 'documents',
  onDelete: 'CASCADE',
  onUpdate: 'CASCADE',
});
OnboardingDocument.belongsTo(EmployeeProfile, {
  foreignKey: 'profile_id',
  as: 'employeeProfile',
});

// ── User (HR) ↔ OnboardingDocument (reviewer) ────────────────────────────
User.hasMany(OnboardingDocument, {
  foreignKey: 'reviewed_by',
  as: 'reviewedDocuments',
  onDelete: 'SET NULL',
  onUpdate: 'CASCADE',
});
OnboardingDocument.belongsTo(User, {
  foreignKey: 'reviewed_by',
  as: 'reviewer',
});

// ── User ↔ OnboardingTask (creator) ──────────────────────────────────────
User.hasMany(OnboardingTask, {
  foreignKey: 'created_by',
  as: 'createdTasks',
  onDelete: 'RESTRICT',
  onUpdate: 'CASCADE',
});
OnboardingTask.belongsTo(User, {
  foreignKey: 'created_by',
  as: 'creator',
});

// ── EmployeeProfile ↔ TaskAssignment ─────────────────────────────────────
EmployeeProfile.hasMany(TaskAssignment, {
  foreignKey: 'profile_id',
  as: 'taskAssignments',
  onDelete: 'CASCADE',
  onUpdate: 'CASCADE',
});
TaskAssignment.belongsTo(EmployeeProfile, {
  foreignKey: 'profile_id',
  as: 'employeeProfile',
});

// ── OnboardingTask ↔ TaskAssignment ──────────────────────────────────────
OnboardingTask.hasMany(TaskAssignment, {
  foreignKey: 'task_id',
  as: 'assignments',
  onDelete: 'RESTRICT',
  onUpdate: 'CASCADE',
});
TaskAssignment.belongsTo(OnboardingTask, {
  foreignKey: 'task_id',
  as: 'task',
});

// ── User ↔ TaskAssignment (assigner) ─────────────────────────────────────
User.hasMany(TaskAssignment, {
  foreignKey: 'assigned_by',
  as: 'assignedTasks',
  onDelete: 'RESTRICT',
  onUpdate: 'CASCADE',
});
TaskAssignment.belongsTo(User, {
  foreignKey: 'assigned_by',
  as: 'assigner',
});

// ── User ↔ EvaluationCriterion (creator) ─────────────────────────────────
User.hasMany(EvaluationCriterion, {
  foreignKey: 'created_by',
  as: 'createdCriteria',
  onDelete: 'RESTRICT',
  onUpdate: 'CASCADE',
});
EvaluationCriterion.belongsTo(User, {
  foreignKey: 'created_by',
  as: 'creator',
});

// ── EmployeeProfile ↔ ProbationPeriod ────────────────────────────────────
EmployeeProfile.hasMany(ProbationPeriod, {
  foreignKey: 'profile_id',
  as: 'probationPeriods',
  onDelete: 'CASCADE',
  onUpdate: 'CASCADE',
});
ProbationPeriod.belongsTo(EmployeeProfile, {
  foreignKey: 'profile_id',
  as: 'employeeProfile',
});

// ── ProbationPeriod ↔ EvaluationCheckpoint ───────────────────────────────
ProbationPeriod.hasMany(EvaluationCheckpoint, {
  foreignKey: 'period_id',
  as: 'checkpoints',
  onDelete: 'CASCADE',
  onUpdate: 'CASCADE',
});
EvaluationCheckpoint.belongsTo(ProbationPeriod, {
  foreignKey: 'period_id',
  as: 'probationPeriod',
});

// ── EvaluationCheckpoint ↔ ManagerEvaluation (1:1) ───────────────────────
EvaluationCheckpoint.hasOne(ManagerEvaluation, {
  foreignKey: 'checkpoint_id',
  as: 'managerEvaluation',
  onDelete: 'CASCADE',
  onUpdate: 'CASCADE',
});
ManagerEvaluation.belongsTo(EvaluationCheckpoint, {
  foreignKey: 'checkpoint_id',
  as: 'checkpoint',
});

// ── User ↔ ManagerEvaluation (evaluator) ─────────────────────────────────
User.hasMany(ManagerEvaluation, {
  foreignKey: 'evaluated_by',
  as: 'submittedEvaluations',
  onDelete: 'RESTRICT',
  onUpdate: 'CASCADE',
});
ManagerEvaluation.belongsTo(User, {
  foreignKey: 'evaluated_by',
  as: 'evaluator',
});

// ── ManagerEvaluation ↔ EvaluationScore ──────────────────────────────────
ManagerEvaluation.hasMany(EvaluationScore, {
  foreignKey: 'eval_id',
  as: 'scores',
  onDelete: 'CASCADE',
  onUpdate: 'CASCADE',
});
EvaluationScore.belongsTo(ManagerEvaluation, {
  foreignKey: 'eval_id',
  as: 'managerEvaluation',
});

// ── EvaluationCriterion ↔ EvaluationScore ────────────────────────────────
EvaluationCriterion.hasMany(EvaluationScore, {
  foreignKey: 'criterion_id',
  as: 'evaluationScores',
  onDelete: 'RESTRICT',
  onUpdate: 'CASCADE',
});
EvaluationScore.belongsTo(EvaluationCriterion, {
  foreignKey: 'criterion_id',
  as: 'criterion',
});

// ── EvaluationCheckpoint ↔ SelfAssessment (1:1) ──────────────────────────
EvaluationCheckpoint.hasOne(SelfAssessment, {
  foreignKey: 'checkpoint_id',
  as: 'selfAssessment',
  onDelete: 'CASCADE',
  onUpdate: 'CASCADE',
});
SelfAssessment.belongsTo(EvaluationCheckpoint, {
  foreignKey: 'checkpoint_id',
  as: 'checkpoint',
});

// ── EmployeeProfile ↔ SelfAssessment ─────────────────────────────────────
EmployeeProfile.hasMany(SelfAssessment, {
  foreignKey: 'employee_profile_id',
  as: 'selfAssessments',
  onDelete: 'CASCADE',
  onUpdate: 'CASCADE',
});
SelfAssessment.belongsTo(EmployeeProfile, {
  foreignKey: 'employee_profile_id',
  as: 'employeeProfile',
});

// ── SelfAssessment ↔ SelfAssessmentScore ─────────────────────────────────
SelfAssessment.hasMany(SelfAssessmentScore, {
  foreignKey: 'assessment_id',
  as: 'scores',
  onDelete: 'CASCADE',
  onUpdate: 'CASCADE',
});
SelfAssessmentScore.belongsTo(SelfAssessment, {
  foreignKey: 'assessment_id',
  as: 'selfAssessment',
});

// ── EvaluationCriterion ↔ SelfAssessmentScore ────────────────────────────
EvaluationCriterion.hasMany(SelfAssessmentScore, {
  foreignKey: 'criterion_id',
  as: 'selfAssessmentScores',
  onDelete: 'RESTRICT',
  onUpdate: 'CASCADE',
});
SelfAssessmentScore.belongsTo(EvaluationCriterion, {
  foreignKey: 'criterion_id',
  as: 'criterion',
});

// ── ProbationPeriod ↔ FinalRecommendation (1:1) ───────────────────────────
ProbationPeriod.hasOne(FinalRecommendation, {
  foreignKey: 'period_id',
  as: 'finalRecommendation',
  onDelete: 'CASCADE',
  onUpdate: 'CASCADE',
});
FinalRecommendation.belongsTo(ProbationPeriod, {
  foreignKey: 'period_id',
  as: 'probationPeriod',
});

// ── User ↔ FinalRecommendation (generator) ───────────────────────────────
User.hasMany(FinalRecommendation, {
  foreignKey: 'generated_by',
  as: 'generatedRecommendations',
  onDelete: 'RESTRICT',
  onUpdate: 'CASCADE',
});
FinalRecommendation.belongsTo(User, {
  foreignKey: 'generated_by',
  as: 'generatedByUser',
});

// ── EmployeeProfile ↔ PerformanceNote ────────────────────────────────────
EmployeeProfile.hasMany(PerformanceNote, {
  foreignKey: 'profile_id',
  as: 'performanceNotes',
  onDelete: 'CASCADE',
  onUpdate: 'CASCADE',
});
PerformanceNote.belongsTo(EmployeeProfile, {
  foreignKey: 'profile_id',
  as: 'employeeProfile',
});

// ── User ↔ PerformanceNote (recorder) ────────────────────────────────────
User.hasMany(PerformanceNote, {
  foreignKey: 'recorded_by',
  as: 'recordedNotes',
  onDelete: 'RESTRICT',
  onUpdate: 'CASCADE',
});
PerformanceNote.belongsTo(User, {
  foreignKey: 'recorded_by',
  as: 'recorder',
});

// ── EvaluationCheckpoint ↔ PerformanceNote (optional link) ───────────────
EvaluationCheckpoint.hasMany(PerformanceNote, {
  foreignKey: 'evaluation_period_id',
  as: 'performanceNotes',
  onDelete: 'SET NULL',
  onUpdate: 'CASCADE',
});
PerformanceNote.belongsTo(EvaluationCheckpoint, {
  foreignKey: 'evaluation_period_id',
  as: 'checkpoint',
});

// ── ProbationPeriod ↔ GeneratedReport ────────────────────────────────────
ProbationPeriod.hasMany(GeneratedReport, {
  foreignKey: 'period_id',
  as: 'generatedReports',
  onDelete: 'CASCADE',
  onUpdate: 'CASCADE',
});
GeneratedReport.belongsTo(ProbationPeriod, {
  foreignKey: 'period_id',
  as: 'probationPeriod',
});

// ── User ↔ GeneratedReport (generator) ───────────────────────────────────
User.hasMany(GeneratedReport, {
  foreignKey: 'generated_by',
  as: 'generatedReports',
  onDelete: 'RESTRICT',
  onUpdate: 'CASCADE',
});
GeneratedReport.belongsTo(User, {
  foreignKey: 'generated_by',
  as: 'generatedByUser',
});

// ── User ↔ Notification ───────────────────────────────────────────────────
User.hasMany(Notification, {
  foreignKey: 'user_id',
  as: 'notifications',
  onDelete: 'CASCADE',
  onUpdate: 'CASCADE',
});
Notification.belongsTo(User, {
  foreignKey: 'user_id',
  as: 'recipient',
});

// ── User ↔ AuditLog ───────────────────────────────────────────────────────
User.hasMany(AuditLog, {
  foreignKey: 'user_id',
  as: 'auditLogs',
  onDelete: 'RESTRICT',
  onUpdate: 'CASCADE',
});
AuditLog.belongsTo(User, {
  foreignKey: 'user_id',
  as: 'actor',
});

// =============================================================================
// EXPORTS
// =============================================================================

module.exports = {
  sequelize,
  Department,
  User,
  EmployeeProfile,
  DocumentType,
  OnboardingDocument,
  OnboardingTask,
  TaskAssignment,
  EvaluationCriterion,
  ProbationPeriod,
  EvaluationCheckpoint,
  ManagerEvaluation,
  EvaluationScore,
  SelfAssessment,
  SelfAssessmentScore,
  FinalRecommendation,
  PerformanceNote,
  GeneratedReport,
  Notification,
  AuditLog,
};
