import { useState, useRef, useEffect } from 'react';
import {
  interpret,
  EventObject,
  StateMachine,
  State,
  Interpreter,
  InterpreterOptions,
  MachineOptions
} from 'xstate';
import { Actor } from 'xstate/lib/Actor';

interface UseMachineOptions<TContext> {
  /**
   * If provided, will be merged with machine's context.
   */
  context?: Partial<TContext>;
  /**
   * If `true`, service will start immediately (before mount).
   */
  immediate: boolean;
}

const defaultOptions = {
  immediate: false
};

export function useMachine<TContext, TEvent extends EventObject>(
  machine: StateMachine<TContext, any, TEvent>,
  options: Partial<InterpreterOptions> &
    Partial<UseMachineOptions<TContext>> &
    Partial<MachineOptions<TContext, TEvent>> = defaultOptions
): [
  State<TContext, TEvent>,
  Interpreter<TContext, any, TEvent>['send'],
  Interpreter<TContext, any, TEvent>
] {
  const {
    context,
    guards,
    actions,
    activities,
    services,
    delays,
    immediate,
    ...interpreterOptions
  } = options;

  const machineConfig = {
    context,
    guards,
    actions,
    activities,
    services,
    delays
  };

  // Reference the machine
  const machineRef = useRef<StateMachine<TContext, any, TEvent> | null>(null);

  // Create the machine only once
  // See https://reactjs.org/docs/hooks-faq.html#how-to-create-expensive-objects-lazily
  if (machineRef.current === null) {
    machineRef.current = machine.withConfig(machineConfig, {
      ...machine.context,
      ...context
    } as TContext);
  }

  // Reference the service
  const serviceRef = useRef<Interpreter<TContext, any, TEvent> | null>(null);

  // Create the service only once
  if (serviceRef.current === null) {
    serviceRef.current = interpret(
      machineRef.current,
      interpreterOptions
    ).onTransition(state => {
      // Update the current machine state when a transition occurs
      if (state.changed) {
        setCurrent(state);
      }
    });
  }

  const service = serviceRef.current;

  // Make sure actions are kept updated when they change.
  // This mutation assignment is safe because the service instance is only used
  // in one place -- this hook's caller.
  useEffect(() => {
    Object.assign(service.machine.options.actions, actions);
  }, [actions]);

  // Start service immediately (before mount) if specified in options
  if (immediate) {
    service.start();
  }

  // Keep track of the current machine state
  const [current, setCurrent] = useState(service.initialState);

  useEffect(() => {
    // Start the service when the component mounts.
    // Note: the service will start only if it hasn't started already.
    service.start();

    return () => {
      // Stop the service when the component unmounts
      service.stop();
    };
  }, []);

  return [current, service.send, service];
}


/*
	service
*/
export function useService<TContext, TEvent extends EventObject>(

	// 注意收到的是 Interpreter，也就是 Machine 類型的 actor
  service: Interpreter<TContext, any, TEvent>
): [
  State<TContext, TEvent>,
  Interpreter<TContext, any, TEvent>['send'],
  Interpreter<TContext, any, TEvent>
] {

	// 將當前 interpreter 的 state 記錄下來
  const [current, setCurrent] = useState(service.state);

  useEffect(() => {
    // Set to current service state as there is a possibility
    // of a transition occurring between the initial useState()
    // initialization and useEffect() commit.
    setCurrent(service.state);

    const listener = state => {
      if (state.changed) {
      	// 有變動就存入然後就觸發重繪
        setCurrent(state);
      }
    };

    // 對傳入的 interpreter 偵聽變化
    // 目地是每次變化後將新的 state 存入 useState hooks 並觸發重繪
    const sub = service.subscribe(listener);

    return () => {
      sub.unsubscribe();
    };

  // 顯然是每次有餵入新的 interpreter 時才重跑
  }, [service]);

  // 返還 [當前狀態, send 指令, service 就是 interpreter 本身 ]
  return [current, service.send, service];
}


/*
	actor
*/
export function useActor<TC, TE extends EventObject>(
  actor?: Actor<TC, TE>
): [TC | undefined, Actor<TC, TE>['send']] {

  const [current, setCurrent] = useState<TC | undefined>(undefined);

  const actorRef = useRef<Actor<TC, TE> | undefined>(actor);

  useEffect(() => {
    if (actor) {
      actorRef.current = actor;

      // 注意這裏 subscribe() 就是聽事件，因此 setCurrent 就是將最新事件存起來
      const sub = actor.subscribe(setCurrent);

      return () => {
        sub.unsubscribe();
      };
    }
  }, [actor]);

  return [current, actorRef.current ? actorRef.current.send : () => void 0];
}
