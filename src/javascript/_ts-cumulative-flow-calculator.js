Ext.define("CumulativeFlowCalculator", {
     extend: "Rally.data.lookback.calculator.TimeSeriesCalculator",
     config: {
         stateFieldName: 'ScheduleState',
         stateFieldValues: ['Defined', 'In-Progress', 'Completed', 'Accepted']
     },
     runCalculation: function (snapshots) {
         var calculatorConfig = this._prepareCalculatorConfig(),
             seriesConfig = this._buildSeriesConfig(calculatorConfig);

         var calculator = this.prepareCalculator(calculatorConfig);
         calculator.addSnapshots(snapshots, this._getStartDate(snapshots), this._getEndDate(snapshots));
         
         return this._transformLumenizeDataToHighchartsSeries(calculator, seriesConfig);
     },
     constructor: function(config) {
         this.initConfig(config);
         this.callParent(arguments);
     },
     getMetrics: function() {
         return _.map(this.getStateFieldValues(), function(stateFieldValue) {
             return  {
                 as: stateFieldValue,
                 groupByField: this.getStateFieldName(),
                 allowedValues: [stateFieldValue],
                 f: 'groupByCount',
                 display: 'area'
             };
         }, this);
     },
     getDerivedFieldsOnInput: function(){
         return [];
     },
     getDerivedFieldsAfterSummary: function(){
         return [];
     }
 });