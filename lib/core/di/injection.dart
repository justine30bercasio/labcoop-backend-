import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:dio/dio.dart';
import 'package:get_it/get_it.dart';
import '../../data/datasources/local_db_source.dart';
import '../../data/datasources/remote_api_source.dart';
import '../../data/datasources/sample_api_source.dart';
import '../../data/repositories/savings_repository_impl.dart';
import '../../data/repositories/banking_repository_impl.dart';
import '../../domain/repositories/savings_repository.dart';
import '../../domain/repositories/banking_repository.dart';
import '../../domain/usecases/allocate_deposit_usecase.dart';
import '../../domain/usecases/calculate_goal_progress_usecase.dart';
import '../../domain/usecases/check_badge_unlock_usecase.dart';
import '../../domain/usecases/transfer_between_jars_usecase.dart';
import '../../presentation/blocs/savings_bloc.dart';
import '../../presentation/blocs/goal_bloc.dart';
import '../../presentation/blocs/banking_bloc.dart';
import '../../presentation/blocs/loan_bloc.dart';
import '../network/dio_client.dart';

final sl = GetIt.instance;

Future<void> initDependencies() async {
  sl.registerLazySingleton<Dio>(() => DioClient.create());
  sl.registerLazySingleton<Connectivity>(() => Connectivity());

  sl.registerLazySingleton<LocalDbSource>(() => LocalDbSource());
  sl.registerLazySingleton<RemoteApiSource>(
    () => RemoteApiSource(sl<Dio>()),
  );
  sl.registerLazySingleton<SampleApiSource>(() => SampleApiSource());

  sl.registerLazySingleton<SavingsRepository>(
    () => SavingsRepositoryImpl(
      sl<RemoteApiSource>(),
      sl<LocalDbSource>(),
      sl<Connectivity>(),
      sl<SampleApiSource>(),
    ),
  );

  sl.registerLazySingleton<BankingRepository>(
    () => BankingRepositoryImpl(
      sl<RemoteApiSource>(),
      sl<LocalDbSource>(),
      sl<Connectivity>(),
    ),
  );

  sl.registerLazySingleton<AllocateDepositUseCase>(
    () => AllocateDepositUseCase(sl<SavingsRepository>()),
  );
  sl.registerLazySingleton<TransferBetweenJarsUseCase>(
    () => TransferBetweenJarsUseCase(sl<SavingsRepository>()),
  );
  sl.registerLazySingleton<CalculateGoalProgressUseCase>(
    () => const CalculateGoalProgressUseCase(),
  );
  sl.registerLazySingleton<CheckBadgeUnlockUseCase>(
    () => const CheckBadgeUnlockUseCase(),
  );

  sl.registerFactory<SavingsBloc>(
    () => SavingsBloc(
      sl<SavingsRepository>(),
      sl<AllocateDepositUseCase>(),
      sl<TransferBetweenJarsUseCase>(),
      sl<CheckBadgeUnlockUseCase>(),
    ),
  );
  sl.registerFactory<GoalBloc>(
    () => GoalBloc(sl<SavingsRepository>()),
  );

  sl.registerFactory<BankingBloc>(
    () => BankingBloc(sl<BankingRepository>()),
  );
  sl.registerFactory<LoanBloc>(
    () => LoanBloc(sl<BankingRepository>()),
  );
}
