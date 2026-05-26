# ML Patterns Knowledge Base

## Overview

Guía práctica para diseñar e implementar sistemas de Machine Learning. Cubre patterns de training, inference, MLOps y feature engineering.

---

## ML System Architecture

### End-to-End ML Pipeline

```
┌─────────────────────────────────────────────────────────────────┐
│                    ML System Architecture                        │
└─────────────────────────────────────────────────────────────────┘

Data Sources          Feature Store         Model Training
    │                      │                      │
    ▼                      ▼                      ▼
┌────────┐           ┌──────────┐           ┌──────────┐
│ Raw    │           │ Feature  │           │ Training │
│ Data   │──────────▶│ Pipeline │──────────▶│ Pipeline │
│        │           │          │           │          │
└────────┘           └──────────┘           └──────────┘
                          │                      │
                          │                      │
                          ▼                      ▼
                    ┌──────────┐           ┌──────────┐
                    │ Feature  │           │  Model   │
                    │  Store   │           │ Registry │
                    └──────────┘           └──────────┘
                          │                      │
                          │                      │
                          └──────────┬───────────┘
                                     │
                                     ▼
                              ┌──────────────┐
                              │   Serving    │
                              │   Pipeline   │
                              └──────────────┘
                                     │
                                     ▼
                              ┌──────────────┐
                              │  Monitoring  │
                              │  & Alerting  │
                              └──────────────┘
```

### Training Pipeline

```python
# Modern training pipeline structure
class TrainingPipeline:
    def __init__(self, config: TrainingConfig):
        self.config = config
        self.experiment_tracker = MLflowTracker()

    def run(self):
        with self.experiment_tracker.start_run():
            # 1. Data ingestion
            raw_data = self.ingest_data()

            # 2. Data validation
            self.validate_data(raw_data)

            # 3. Feature engineering
            features = self.engineer_features(raw_data)

            # 4. Train/test split
            train, val, test = self.split_data(features)

            # 5. Model training
            model = self.train_model(train, val)

            # 6. Evaluation
            metrics = self.evaluate_model(model, test)

            # 7. Model validation
            if self.passes_validation(metrics):
                # 8. Register model
                self.register_model(model, metrics)

            return model, metrics
```

---

## Feature Engineering

### Feature Types & Transformations

| Feature Type | Transformations | Example |
|--------------|-----------------|---------|
| Numeric | StandardScaler, MinMax, Log, Binning | age, price, count |
| Categorical (low card) | OneHotEncoder | gender, country |
| Categorical (high card) | TargetEncoder, Embedding | user_id, product_id |
| Text | TF-IDF, Embeddings, Tokenization | description, title |
| Datetime | Cyclical, Lag, Rolling | timestamp, date |
| Geospatial | Clustering, Distance | lat/lon |

### Numeric Features

```python
import numpy as np
from sklearn.preprocessing import StandardScaler, PowerTransformer

class NumericFeatureTransformer:
    """Transforms numeric features with best practices."""

    def transform_standard(self, X):
        """Standard scaling: mean=0, std=1"""
        scaler = StandardScaler()
        return scaler.fit_transform(X)

    def transform_log(self, X):
        """Log transform for right-skewed data"""
        return np.log1p(X)  # log(1+x) handles zeros

    def transform_power(self, X):
        """Yeo-Johnson for any distribution"""
        transformer = PowerTransformer(method='yeo-johnson')
        return transformer.fit_transform(X)

    def create_bins(self, X, n_bins=10, strategy='quantile'):
        """Discretize into bins"""
        from sklearn.preprocessing import KBinsDiscretizer
        discretizer = KBinsDiscretizer(
            n_bins=n_bins,
            encode='ordinal',
            strategy=strategy  # 'uniform', 'quantile', 'kmeans'
        )
        return discretizer.fit_transform(X)

    def handle_outliers(self, X, method='clip'):
        """Handle outliers"""
        if method == 'clip':
            q1, q99 = np.percentile(X, [1, 99])
            return np.clip(X, q1, q99)
        elif method == 'winsorize':
            from scipy.stats import mstats
            return mstats.winsorize(X, limits=[0.01, 0.01])
```

### Categorical Features

```python
from sklearn.preprocessing import OneHotEncoder, LabelEncoder
from category_encoders import TargetEncoder

class CategoricalFeatureTransformer:
    """Transforms categorical features."""

    def onehot_encode(self, X, max_categories=20):
        """One-hot encoding for low cardinality"""
        encoder = OneHotEncoder(
            max_categories=max_categories,
            handle_unknown='ignore',
            sparse_output=False
        )
        return encoder.fit_transform(X)

    def target_encode(self, X, y, smoothing=10):
        """Target encoding for high cardinality"""
        encoder = TargetEncoder(
            smoothing=smoothing,
            handle_unknown='value',
            handle_missing='value'
        )
        return encoder.fit_transform(X, y)

    def frequency_encode(self, X):
        """Frequency encoding"""
        freq = X.value_counts(normalize=True)
        return X.map(freq)

    def hash_encode(self, X, n_components=8):
        """Hash encoding for very high cardinality"""
        from category_encoders import HashingEncoder
        encoder = HashingEncoder(n_components=n_components)
        return encoder.fit_transform(X)
```

### Datetime Features

```python
import pandas as pd
import numpy as np

class DatetimeFeatureExtractor:
    """Extracts features from datetime columns."""

    def extract_all(self, df, datetime_col):
        """Extract comprehensive datetime features"""
        dt = pd.to_datetime(df[datetime_col])

        features = pd.DataFrame({
            # Basic components
            'hour': dt.dt.hour,
            'day': dt.dt.day,
            'dayofweek': dt.dt.dayofweek,
            'month': dt.dt.month,
            'year': dt.dt.year,
            'quarter': dt.dt.quarter,

            # Derived
            'is_weekend': dt.dt.dayofweek >= 5,
            'is_month_start': dt.dt.is_month_start,
            'is_month_end': dt.dt.is_month_end,

            # Cyclical encoding (for continuous patterns)
            'hour_sin': np.sin(2 * np.pi * dt.dt.hour / 24),
            'hour_cos': np.cos(2 * np.pi * dt.dt.hour / 24),
            'day_sin': np.sin(2 * np.pi * dt.dt.dayofweek / 7),
            'day_cos': np.cos(2 * np.pi * dt.dt.dayofweek / 7),
            'month_sin': np.sin(2 * np.pi * dt.dt.month / 12),
            'month_cos': np.cos(2 * np.pi * dt.dt.month / 12),
        })

        return features

    def create_lag_features(self, df, value_col, lags=[1, 7, 30]):
        """Create lag features for time series"""
        for lag in lags:
            df[f'{value_col}_lag_{lag}'] = df[value_col].shift(lag)
        return df

    def create_rolling_features(self, df, value_col, windows=[7, 30]):
        """Create rolling statistics"""
        for window in windows:
            df[f'{value_col}_rolling_mean_{window}'] = \
                df[value_col].rolling(window).mean()
            df[f'{value_col}_rolling_std_{window}'] = \
                df[value_col].rolling(window).std()
        return df
```

### Feature Store Pattern

```python
from datetime import datetime
from typing import List, Dict

class FeatureStore:
    """Feature store interface."""

    def __init__(self, backend='redis'):
        self.backend = self._init_backend(backend)

    def register_feature(self, feature_name: str, feature_def: Dict):
        """Register a feature definition"""
        # Store feature metadata
        self.backend.set(f"feature:def:{feature_name}", {
            'name': feature_name,
            'type': feature_def['type'],
            'transformation': feature_def['transformation'],
            'entity': feature_def['entity'],
            'created_at': datetime.now().isoformat()
        })

    def get_online_features(self, entity_ids: List[str],
                           feature_names: List[str]) -> Dict:
        """Get features for online inference (low latency)"""
        features = {}
        for entity_id in entity_ids:
            features[entity_id] = {}
            for feature_name in feature_names:
                key = f"feature:{feature_name}:{entity_id}"
                features[entity_id][feature_name] = self.backend.get(key)
        return features

    def get_historical_features(self, entity_df, feature_names: List[str],
                                timestamp_col: str) -> pd.DataFrame:
        """Get point-in-time correct features for training"""
        # Join features at correct timestamp to prevent data leakage
        pass

    def materialize_features(self, feature_names: List[str]):
        """Compute and store features for all entities"""
        pass
```

---

## Model Training Patterns

### Experiment Tracking

```python
import mlflow
from datetime import datetime

class ExperimentTracker:
    """MLflow-based experiment tracking."""

    def __init__(self, experiment_name: str):
        mlflow.set_experiment(experiment_name)

    def log_run(self, model, params: Dict, metrics: Dict,
                artifacts: List[str] = None):
        """Log a complete training run"""
        with mlflow.start_run():
            # Log parameters
            mlflow.log_params(params)

            # Log metrics
            mlflow.log_metrics(metrics)

            # Log model
            mlflow.sklearn.log_model(
                model,
                "model",
                registered_model_name=f"{self.experiment_name}_model"
            )

            # Log artifacts (plots, feature importance, etc.)
            if artifacts:
                for artifact_path in artifacts:
                    mlflow.log_artifact(artifact_path)

            return mlflow.active_run().info.run_id

    def get_best_run(self, metric: str, ascending: bool = True):
        """Get the best run by metric"""
        runs = mlflow.search_runs(
            order_by=[f"metrics.{metric} {'ASC' if ascending else 'DESC'}"],
            max_results=1
        )
        return runs.iloc[0] if len(runs) > 0 else None
```

### Hyperparameter Tuning

```python
from sklearn.model_selection import cross_val_score
import optuna

class HyperparameterTuner:
    """Optuna-based hyperparameter tuning."""

    def __init__(self, model_class, X, y, cv=5, scoring='roc_auc'):
        self.model_class = model_class
        self.X = X
        self.y = y
        self.cv = cv
        self.scoring = scoring

    def objective(self, trial):
        """Define search space and objective"""
        # Example for XGBoost
        params = {
            'n_estimators': trial.suggest_int('n_estimators', 100, 1000),
            'max_depth': trial.suggest_int('max_depth', 3, 10),
            'learning_rate': trial.suggest_float('learning_rate', 0.01, 0.3, log=True),
            'subsample': trial.suggest_float('subsample', 0.6, 1.0),
            'colsample_bytree': trial.suggest_float('colsample_bytree', 0.6, 1.0),
            'min_child_weight': trial.suggest_int('min_child_weight', 1, 10),
        }

        model = self.model_class(**params)
        scores = cross_val_score(model, self.X, self.y,
                                cv=self.cv, scoring=self.scoring)
        return scores.mean()

    def tune(self, n_trials=100, timeout=3600):
        """Run hyperparameter search"""
        study = optuna.create_study(
            direction='maximize',
            pruner=optuna.pruners.MedianPruner()
        )
        study.optimize(self.objective, n_trials=n_trials, timeout=timeout)

        return {
            'best_params': study.best_params,
            'best_value': study.best_value,
            'best_trial': study.best_trial
        }
```

### Cross-Validation Strategies

```python
from sklearn.model_selection import (
    KFold, StratifiedKFold, TimeSeriesSplit, GroupKFold
)

class CVStrategy:
    """Cross-validation strategy selector."""

    @staticmethod
    def get_cv(cv_type: str, n_splits: int = 5, **kwargs):
        """Get appropriate CV strategy"""
        strategies = {
            'standard': KFold(n_splits=n_splits, shuffle=True, random_state=42),

            'stratified': StratifiedKFold(
                n_splits=n_splits, shuffle=True, random_state=42
            ),  # For imbalanced classification

            'time_series': TimeSeriesSplit(
                n_splits=n_splits
            ),  # For time-dependent data

            'grouped': GroupKFold(
                n_splits=n_splits
            ),  # When samples belong to groups
        }
        return strategies.get(cv_type, strategies['standard'])

    @staticmethod
    def train_with_cv(model, X, y, cv, scoring='roc_auc'):
        """Train with cross-validation"""
        from sklearn.model_selection import cross_validate

        results = cross_validate(
            model, X, y, cv=cv,
            scoring=scoring,
            return_train_score=True,
            return_estimator=True
        )

        return {
            'train_scores': results['train_score'],
            'val_scores': results['test_score'],
            'mean_val_score': results['test_score'].mean(),
            'std_val_score': results['test_score'].std(),
            'models': results['estimator']
        }
```

---

## Model Serving

### Batch Inference

```python
import pandas as pd
from typing import Iterator

class BatchInferenceJob:
    """Batch inference pattern."""

    def __init__(self, model, batch_size: int = 10000):
        self.model = model
        self.batch_size = batch_size

    def predict_batch(self, data_path: str, output_path: str):
        """Process data in batches"""
        # Read in chunks
        reader = pd.read_csv(data_path, chunksize=self.batch_size)

        results = []
        for batch_num, batch in enumerate(reader):
            # Preprocess
            features = self.preprocess(batch)

            # Predict
            predictions = self.model.predict(features)
            probabilities = self.model.predict_proba(features)

            # Add predictions to batch
            batch['prediction'] = predictions
            batch['probability'] = probabilities[:, 1]

            results.append(batch)

            print(f"Processed batch {batch_num + 1}")

        # Save results
        final_df = pd.concat(results)
        final_df.to_parquet(output_path)

        return final_df
```

### Real-time Inference

```python
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import joblib
import numpy as np

app = FastAPI()

# Load model at startup
model = None

@app.on_event("startup")
async def load_model():
    global model
    model = joblib.load("model.pkl")

class PredictionRequest(BaseModel):
    features: dict

class PredictionResponse(BaseModel):
    prediction: int
    probability: float
    model_version: str

@app.post("/predict", response_model=PredictionResponse)
async def predict(request: PredictionRequest):
    """Real-time prediction endpoint"""
    if model is None:
        raise HTTPException(status_code=503, detail="Model not loaded")

    try:
        # Preprocess input
        features = preprocess(request.features)

        # Make prediction
        prediction = model.predict(features)[0]
        probability = model.predict_proba(features)[0][1]

        return PredictionResponse(
            prediction=int(prediction),
            probability=float(probability),
            model_version=model.version
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/health")
async def health():
    return {"status": "healthy", "model_loaded": model is not None}
```

### Model Serving Best Practices

```python
class ModelServer:
    """Production-ready model server."""

    def __init__(self, model_path: str):
        self.model = self._load_model(model_path)
        self.preprocessor = self._load_preprocessor(model_path)
        self.feature_names = self._load_feature_names(model_path)

    def predict(self, raw_input: dict) -> dict:
        """Make prediction with full pipeline"""
        # 1. Validate input
        self._validate_input(raw_input)

        # 2. Preprocess (SAME as training!)
        features = self.preprocessor.transform(
            pd.DataFrame([raw_input])
        )

        # 3. Predict
        start_time = time.time()
        prediction = self.model.predict(features)[0]
        probability = self.model.predict_proba(features)[0]
        latency = time.time() - start_time

        # 4. Log for monitoring
        self._log_prediction({
            'input': raw_input,
            'prediction': prediction,
            'probability': probability.tolist(),
            'latency_ms': latency * 1000
        })

        return {
            'prediction': int(prediction),
            'probabilities': {
                'class_0': float(probability[0]),
                'class_1': float(probability[1])
            },
            'latency_ms': latency * 1000
        }

    def _validate_input(self, raw_input: dict):
        """Validate input has all required features"""
        missing = set(self.feature_names) - set(raw_input.keys())
        if missing:
            raise ValueError(f"Missing features: {missing}")
```

---

## MLOps

### Model Registry

```python
from datetime import datetime
from enum import Enum

class ModelStage(Enum):
    DEVELOPMENT = "development"
    STAGING = "staging"
    PRODUCTION = "production"
    ARCHIVED = "archived"

class ModelRegistry:
    """Model registry for version control."""

    def register_model(self, model_name: str, model_path: str,
                       metrics: dict, params: dict) -> str:
        """Register a new model version"""
        version = self._get_next_version(model_name)

        model_record = {
            'name': model_name,
            'version': version,
            'path': model_path,
            'metrics': metrics,
            'params': params,
            'stage': ModelStage.DEVELOPMENT.value,
            'created_at': datetime.now().isoformat(),
            'created_by': self._get_current_user()
        }

        self._save_model_record(model_record)
        return version

    def transition_stage(self, model_name: str, version: str,
                        new_stage: ModelStage):
        """Transition model to new stage"""
        record = self._get_model_record(model_name, version)

        # If transitioning to production, archive current production
        if new_stage == ModelStage.PRODUCTION:
            self._archive_current_production(model_name)

        record['stage'] = new_stage.value
        record['transitioned_at'] = datetime.now().isoformat()

        self._save_model_record(record)

    def get_production_model(self, model_name: str):
        """Get current production model"""
        return self._get_model_by_stage(model_name, ModelStage.PRODUCTION)
```

### Data & Model Versioning

```python
# Using DVC (Data Version Control)

# 1. Initialize DVC
# dvc init

# 2. Track data
# dvc add data/training_data.parquet

# 3. Version with Git
# git add data/training_data.parquet.dvc
# git commit -m "Add training data v1"

# 4. Push to remote storage
# dvc push

# Pipeline definition (dvc.yaml)
"""
stages:
  preprocess:
    cmd: python src/preprocess.py
    deps:
      - data/raw/
      - src/preprocess.py
    outs:
      - data/processed/

  train:
    cmd: python src/train.py
    deps:
      - data/processed/
      - src/train.py
    params:
      - train.n_estimators
      - train.max_depth
    outs:
      - models/model.pkl
    metrics:
      - metrics.json:
          cache: false
"""
```

### Monitoring

```python
from typing import Dict, List
import numpy as np
from scipy import stats

class ModelMonitor:
    """Monitor model performance and data drift."""

    def __init__(self, baseline_data: np.ndarray, feature_names: List[str]):
        self.baseline = baseline_data
        self.feature_names = feature_names
        self.baseline_stats = self._compute_stats(baseline_data)

    def detect_data_drift(self, new_data: np.ndarray,
                          threshold: float = 0.05) -> Dict:
        """Detect data drift using KS test"""
        drift_results = {}

        for i, feature in enumerate(self.feature_names):
            statistic, p_value = stats.ks_2samp(
                self.baseline[:, i],
                new_data[:, i]
            )

            drift_results[feature] = {
                'statistic': statistic,
                'p_value': p_value,
                'drifted': p_value < threshold
            }

        return drift_results

    def compute_psi(self, expected: np.ndarray, actual: np.ndarray,
                    n_bins: int = 10) -> float:
        """Population Stability Index for distribution shift"""
        # Bin the data
        breakpoints = np.linspace(
            min(expected.min(), actual.min()),
            max(expected.max(), actual.max()),
            n_bins + 1
        )

        expected_counts = np.histogram(expected, breakpoints)[0]
        actual_counts = np.histogram(actual, breakpoints)[0]

        # Normalize
        expected_pct = expected_counts / len(expected)
        actual_pct = actual_counts / len(actual)

        # Handle zeros
        expected_pct = np.where(expected_pct == 0, 0.0001, expected_pct)
        actual_pct = np.where(actual_pct == 0, 0.0001, actual_pct)

        # Calculate PSI
        psi = np.sum((actual_pct - expected_pct) *
                     np.log(actual_pct / expected_pct))

        return psi

    def evaluate_predictions(self, y_true: np.ndarray,
                            y_pred: np.ndarray) -> Dict:
        """Evaluate model performance"""
        from sklearn.metrics import (
            accuracy_score, precision_score, recall_score,
            f1_score, roc_auc_score
        )

        return {
            'accuracy': accuracy_score(y_true, y_pred),
            'precision': precision_score(y_true, y_pred),
            'recall': recall_score(y_true, y_pred),
            'f1': f1_score(y_true, y_pred),
            'roc_auc': roc_auc_score(y_true, y_pred)
        }
```

### Alerting

```python
class AlertManager:
    """Alert management for ML systems."""

    def __init__(self, thresholds: Dict):
        self.thresholds = thresholds
        self.alert_channels = ['slack', 'pagerduty', 'email']

    def check_and_alert(self, metrics: Dict):
        """Check metrics and send alerts if thresholds exceeded"""
        alerts = []

        # Check performance degradation
        if metrics.get('accuracy', 1) < self.thresholds.get('min_accuracy', 0.8):
            alerts.append({
                'type': 'performance_degradation',
                'severity': 'critical',
                'message': f"Accuracy dropped to {metrics['accuracy']:.2%}"
            })

        # Check data drift
        if metrics.get('psi', 0) > self.thresholds.get('max_psi', 0.25):
            alerts.append({
                'type': 'data_drift',
                'severity': 'warning',
                'message': f"PSI exceeded threshold: {metrics['psi']:.3f}"
            })

        # Check latency
        if metrics.get('p99_latency_ms', 0) > self.thresholds.get('max_latency_ms', 100):
            alerts.append({
                'type': 'latency',
                'severity': 'warning',
                'message': f"P99 latency: {metrics['p99_latency_ms']:.0f}ms"
            })

        # Send alerts
        for alert in alerts:
            self._send_alert(alert)

        return alerts
```

---

## Common Pitfalls & Solutions

| Pitfall | Detection | Solution |
|---------|-----------|----------|
| **Data leakage** | Val >> Train performance | Strict time-based split, check feature dates |
| **Training-serving skew** | Prod != offline metrics | Same preprocessing code, feature store |
| **Label leakage** | Suspiciously high accuracy | Audit feature engineering |
| **Class imbalance** | Poor minority recall | SMOTE, class weights, stratified split |
| **Overfitting** | Train >> Val performance | Regularization, more data, simpler model |
| **Feature drift** | Performance decay over time | Monitor distributions, retrain triggers |
| **Stale models** | Gradual performance decay | Scheduled retraining, online learning |

---

## Metrics Cheat Sheet

### Classification

| Metric | When to use | Formula |
|--------|-------------|---------|
| Accuracy | Balanced classes | (TP+TN)/(TP+TN+FP+FN) |
| Precision | FP costly | TP/(TP+FP) |
| Recall | FN costly | TP/(TP+FN) |
| F1 | Balance P/R | 2*P*R/(P+R) |
| AUC-ROC | Ranking ability | Area under ROC |
| AUC-PR | Imbalanced data | Area under PR curve |
| Log Loss | Probability calibration | -mean(y*log(p)) |

### Regression

| Metric | When to use | Formula |
|--------|-------------|---------|
| MSE | Penalize large errors | mean((y-ŷ)²) |
| RMSE | Same scale as target | sqrt(MSE) |
| MAE | Outlier robust | mean(|y-ŷ|) |
| MAPE | Percentage error | mean(|y-ŷ|/y) * 100 |
| R² | Variance explained | 1 - SS_res/SS_tot |

### Ranking

| Metric | When to use |
|--------|-------------|
| NDCG | Graded relevance |
| MAP | Binary relevance |
| MRR | First relevant item |
| Precision@k | Top-k accuracy |
